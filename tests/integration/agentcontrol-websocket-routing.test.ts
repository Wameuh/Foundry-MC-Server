import { once } from "node:events";
import { createServer, type Server } from "node:http";

import type { AgentControlServerMessage } from "@foundry-mcp/protocol";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import type { AgentControlSlotManager } from "../../apps/mcp-server/src/agentcontrol/slot-manager.js";
import { computeBridgeHmac } from "../../apps/mcp-server/src/bridge/authentication.js";
import { CapabilityCache } from "../../apps/mcp-server/src/bridge/capability-cache.js";
import { SessionRegistry } from "../../apps/mcp-server/src/bridge/session-registry.js";
import { attachBridgeWebSocketServer } from "../../apps/mcp-server/src/bridge/websocket-server.js";
import type { AppConfig } from "../../apps/mcp-server/src/config.js";
import { testRegistration } from "../helpers/test-bridge.js";

const secret = "bridge-secret-long-enough";
const worldId = "test-world";
const foundryOrigin = "http://foundry.example";

function testConfig(): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    mcpBearerToken: "mcp-token-long-enough",
    bridgeSecret: secret,
    targetWorldId: worldId,
    foundryOrigin,
    foundryDirectUrl: foundryOrigin,
    foundryDirectCredentialsPath: "./data/test-credentials.json",
    agentControlTcp: "127.0.0.1:7331",
    agentControlWorkspace: "./data/agent-workspace",
    agentControlSlotsPath: "./data/agentcontrol-slots.json",
    agentControlInjectFoundryMcp: false,
    auditLogPath: "./data/audit.jsonl",
    logLevel: "silent",
    normalOperationTimeoutMs: 1_000,
    bridgeHeartbeatTimeoutMs: 10_000,
    deleteConfirmationTtlMs: 1_000,
    maxJsonBodyBytes: 1024 * 1024,
  };
}

class BridgeTestClient {
  private readonly socket: WebSocket;
  private readonly messages: unknown[] = [];
  private readonly waiters: ((message: unknown) => void)[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString("utf8")) as unknown;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.messages.push(message);
    });
  }

  static async connect(port: number): Promise<BridgeTestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/foundry-mcp/bridge`, {
      headers: { origin: foundryOrigin }
    });
    const client = new BridgeTestClient(socket);
    await once(socket, "open");
    return client;
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  async next(): Promise<unknown> {
    const queued = this.messages.shift();
    if (queued !== undefined) return queued;
    return await new Promise((resolve) => this.waiters.push(resolve));
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = once(this.socket, "close");
    this.socket.close();
    await closed;
  }
}

describe("AgentControl websocket routing", () => {
  let httpServer: Server;
  let closeSockets: (() => void) | undefined;

  beforeEach(() => {
    closeSockets = undefined;
  });

  afterEach(async () => {
    closeSockets?.();
    if (httpServer?.listening) {
      httpServer.close();
      await once(httpServer, "close");
    }
  });

  it("routes agentcontrol messages only after authentication and registration", async () => {
    httpServer = createServer();
    const logger = pino({ level: "silent" });
    const sessions = new SessionRegistry(worldId, 10_000, logger);
    const capabilities = new CapabilityCache();
    const handled: unknown[] = [];
    const registerClient = vi.fn(() => () => undefined);
    const handleMessage = vi.fn(async (
      _world: string,
      message: unknown,
      send: (message: AgentControlServerMessage) => void
    ) => {
      handled.push(message);
      send({ type: "agentcontrol.slots", slots: [] });
    });
    const agentControl = { registerClient, handleMessage } as unknown as AgentControlSlotManager;
    const wss = attachBridgeWebSocketServer({
      httpServer,
      config: testConfig(),
      sessions,
      capabilities,
      agentControl,
      logger
    });
    closeSockets = () => {
      sessions.close();
      wss.close();
    };

    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const client = await BridgeTestClient.connect(address.port);
    const challenge = await client.next() as { type: string; nonce: string };
    expect(challenge.type).toBe("auth.challenge");

    client.send({
      type: "auth.proof",
      nonce: challenge.nonce,
      worldId,
      userId: testRegistration.user.id,
      hmac: computeBridgeHmac(secret, challenge.nonce, worldId, testRegistration.user.id)
    });
    expect(await client.next()).toEqual({ type: "auth.accepted" });

    client.send({ type: "register", registration: testRegistration });
    expect(await client.next()).toEqual({ type: "registered" });
    expect(registerClient).toHaveBeenCalledWith(worldId, expect.any(Function));

    client.send({ type: "agentcontrol.listSlots" });
    expect(await client.next()).toEqual({ type: "agentcontrol.slots", slots: [] });
    expect(handleMessage).toHaveBeenCalledWith(
      worldId,
      { type: "agentcontrol.listSlots" },
      expect.any(Function)
    );
    expect(handled).toEqual([{ type: "agentcontrol.listSlots" }]);
    await client.close();
  });
});
