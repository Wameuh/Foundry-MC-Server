import type { Server as HttpServer } from "node:http";

import {
  BridgeAuthProofSchema,
  BridgeHeartbeatSchema,
  BridgeRegistrationSchema,
  BridgeResponseSchema,
  ControlProvisionMessageSchema,
  isAgentControlMessage
} from "@foundry-mcp/protocol";
import type { Logger } from "pino";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import type { AppConfig } from "../config.js";
import { assertSafeJson } from "../security/safe-json.js";
import { websocketOriginAllowed } from "../security/origin-policy.js";
import { createBridgeNonce, verifyBridgeAuthentication } from "./authentication.js";
import type { CapabilityCache } from "./capability-cache.js";
import type { BridgeSession } from "./bridge-session.js";
import type { PendingRequests } from "./pending-requests.js";
import type { SessionRegistry } from "./session-registry.js";
import type { DirectFoundrySupervisor } from "../foundry-direct/supervisor.js";
import type { AgentControlSlotManager } from "../agentcontrol/slot-manager.js";

type ConnectionState = {
  nonce: string;
  authenticatedUserId?: string;
  session?: BridgeSession;
  unregisterAgentControl?: () => void;
};

function parseMessage(data: RawData): unknown {
  const text = Array.isArray(data)
    ? Buffer.concat(data).toString("utf8")
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString("utf8")
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  const value = JSON.parse(text) as unknown;
  assertSafeJson(value);
  return value;
}

function isObjectWithType(value: unknown, type: string): value is Record<string, unknown> & { type: string } {
  return !!value && typeof value === "object" && (value as { type?: unknown }).type === type;
}

export function attachBridgeWebSocketServer(options: {
  httpServer: HttpServer;
  config: AppConfig;
  sessions: SessionRegistry;
  pending: PendingRequests;
  capabilities: CapabilityCache;
  direct?: DirectFoundrySupervisor;
  agentControl?: AgentControlSlotManager;
  logger: Logger;
}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: options.config.maxJsonBodyBytes });

  options.httpServer.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/foundry-mcp/bridge") {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!websocketOriginAllowed(request, options.config.foundryOrigin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit("connection", webSocket, request));
  });

  wss.on("connection", (socket) => handleConnection(socket, options));
  return wss;
}

function handleConnection(
  socket: WebSocket,
  options: Omit<Parameters<typeof attachBridgeWebSocketServer>[0], "httpServer">
): void {
  const state: ConnectionState = { nonce: createBridgeNonce() };
  socket.send(JSON.stringify({ type: "auth.challenge", nonce: state.nonce, issuedAt: Date.now() }));
  const authTimer = setTimeout(() => socket.close(4003, "Authentication timeout"), 10_000);
  authTimer.unref();

  socket.on("message", (data) => {
    try {
      const message = parseMessage(data);
      if (isObjectWithType(message, "auth.proof")) {
        const proof = BridgeAuthProofSchema.parse(message);
        if (state.authenticatedUserId || !verifyBridgeAuthentication(
          proof,
          state.nonce,
          options.config.bridgeSecret,
          options.config.targetWorldId
        )) {
          options.logger.warn("Rejected Foundry bridge authentication proof");
          socket.close(4003, "Bridge authentication failed");
          return;
        }
        state.authenticatedUserId = proof.userId;
        clearTimeout(authTimer);
        socket.send(JSON.stringify({ type: "auth.accepted" }));
        return;
      }
      if (!state.authenticatedUserId) {
        socket.close(4003, "Bridge is not authenticated");
        return;
      }
      if (isObjectWithType(message, "register")) {
        if (state.session) throw new Error("Bridge is already registered");
        const registration = BridgeRegistrationSchema.parse(message["registration"]);
        if (registration.user.id !== state.authenticatedUserId) throw new Error("Registration user mismatch");
        state.session = options.sessions.register(socket, registration);
        options.capabilities.set(registration);
        socket.send(JSON.stringify({ type: "registered" }));
        if (options.agentControl) {
          const session = state.session;
          state.unregisterAgentControl = options.agentControl.registerClient(session.worldId, (message) => {
            session.send(message);
          });
        }
        return;
      }
      if (!state.session) throw new Error("Bridge registration is required");
      state.session.touch();
      if (isAgentControlMessage(message)) {
        if (!options.agentControl) throw new Error("AgentControl control plane is unavailable");
        const session = state.session;
        void options.agentControl.handleMessage(session.worldId, message, (reply) => {
          session.send(reply);
        }).catch((error: unknown) => {
          options.logger.warn({ error }, "AgentControl control message failed");
          session.send({
            type: "agentcontrol.error",
            code: "INTERNAL_ERROR",
            message: "AgentControl control message failed"
          });
        });
        return;
      }
      if (isObjectWithType(message, "ping")) {
        BridgeHeartbeatSchema.parse(message);
        state.session.send({ type: "pong", timestamp: Date.now() });
        return;
      }
      if (isObjectWithType(message, "control.provision")) {
        const provision = ControlProvisionMessageSchema.parse(message);
        if (!options.direct) throw new Error("Direct backend provisioning is unavailable");
        void options.direct.provision({
          worldId: state.session.worldId,
          userId: provision.serviceAccount.userId,
          username: provision.serviceAccount.username,
          password: provision.serviceAccount.password
        }).then((status) => {
          state.session?.send({ type: "control.provisioned", ok: true, status });
        }).catch((error: unknown) => {
          state.session?.send({
            type: "control.provisioned",
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        });
        return;
      }
      if (isObjectWithType(message, "response")) {
        const response = BridgeResponseSchema.parse(message["response"]);
        if (!options.pending.settle(response)) {
          options.logger.debug({ requestId: response.requestId }, "Ignoring unknown or late bridge response");
        }
        return;
      }
      throw new Error("Unknown bridge message");
    } catch (error) {
      options.logger.warn({ error }, "Rejected bridge message");
      socket.close(4002, "Invalid bridge message");
    }
  });

  socket.on("close", () => {
    clearTimeout(authTimer);
    state.unregisterAgentControl?.();
    if (state.session && options.sessions.clear(state.session)) {
      options.capabilities.clear();
      options.pending.rejectAll();
    }
  });

  socket.on("error", (error) => options.logger.warn({ error }, "Foundry bridge WebSocket error"));
}
