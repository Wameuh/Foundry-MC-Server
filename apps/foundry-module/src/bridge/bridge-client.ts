import {
  APPLICATION_VERSION,
  AgentControlServerMessageSchema,
  type AgentControlServerMessage,
  type BridgeRegistration,
} from "@foundry-mcp/protocol";
import { createChallengeHmac } from "./authenticate";
import { Heartbeat } from "./heartbeat";
import { ReconnectBackoff } from "./reconnect";
import { readSettings, type BridgeSettings } from "../settings/read-settings";

type ServerMessage =
  | { type: "auth.challenge"; nonce: string; issuedAt: number }
  | { type: "auth.accepted" }
  | { type: "registered" }
  | { type: "control.provisioned"; ok: boolean; error?: string }
  | { type: "ping" | "pong"; timestamp: number }
  | AgentControlServerMessage;

type ServerMessageHandler = (message: AgentControlServerMessage) => void;
type ConnectionStateHandler = (registered: boolean) => void;

export class BridgeClient {
  private socket: WebSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private registered = false;
  private readonly controlQueue: unknown[] = [];
  private readonly serverMessageHandlers = new Set<ServerMessageHandler>();
  private readonly connectionStateHandlers = new Set<ConnectionStateHandler>();
  private emittedConnectionState = false;
  private stopped = false;
  private readonly backoff = new ReconnectBackoff();
  private readonly heartbeat = new Heartbeat(
    () => this.send({ type: "ping", timestamp: Date.now() }),
    () => this.socket?.close(4000, "heartbeat timeout"),
  );

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.heartbeat.stop();
    this.socket?.close(1000, "module shutdown");
    this.socket = undefined;
    this.registered = false;
    this.emitConnectionState(false);
  }

  /** Restart the bridge using the current module settings. */
  restart(): void {
    this.stop();
    this.backoff.reset();
    this.start();
  }

  sendServiceAccountProvision(serviceAccount: { userId: string; username: string; password: string }): void {
    this.sendControl({ type: "control.provision", serviceAccount });
  }

  /**
   * Send a control-plane message. Messages sent before bridge registration are
   * queued and transmitted in order as soon as the server accepts registration.
   */
  sendControl(message: unknown): void {
    if (this.registered && this.socket?.readyState === WebSocket.OPEN) this.send(message);
    else this.controlQueue.push(message);
  }

  /** Subscribe to validated agentcontrol.* messages received from the server. */
  onServerMessage(handler: ServerMessageHandler): () => void {
    this.serverMessageHandlers.add(handler);
    return () => this.serverMessageHandlers.delete(handler);
  }

  /** Subscribe to bridge registration changes. */
  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  isRegistered(): boolean {
    return this.registered && this.socket?.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    if (this.stopped || !game.user?.isGM) return;
    const settings = readSettings();
    if (!settings.bridgeUrl || !settings.bridgeSecret) return;
    if (!isAllowedBridgeUrl(settings.bridgeUrl)) {
      ui.notifications?.error("Foundry MCP: use WSS, or WS only from an HTTP page on a local network.");
      return;
    }
    this.registered = false;
    const socket = new WebSocket(settings.bridgeUrl);
    this.socket = socket;
    socket.addEventListener("open", () => this.debug(settings, "WebSocket connected; awaiting challenge."));
    socket.addEventListener("message", (event) => this.onMessage(event, settings));
    socket.addEventListener("close", (event) => this.onClose(settings, socket, event));
    socket.addEventListener("error", () => this.debug(settings, "WebSocket error."));
  }

  private onMessage(event: MessageEvent, settings: BridgeSettings): void {
    this.heartbeat.touch();
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      this.socket?.close(1003, "invalid JSON");
      return;
    }
    if (!message || typeof message !== "object" || typeof message.type !== "string") return;
    if (message.type.startsWith("agentcontrol.")) {
      const parsed = AgentControlServerMessageSchema.safeParse(message);
      if (parsed.success) this.dispatchServerMessage(parsed.data);
      else this.debug(settings, `Ignoring invalid AgentControl message ${message.type}.`);
      return;
    }
    switch (message.type) {
      case "auth.challenge":
        this.authenticate(message.nonce, settings);
        break;
      case "auth.accepted":
        this.backoff.reset();
        this.heartbeat.start();
        this.send({ type: "register", registration: createRegistration() });
        break;
      case "registered":
        this.registered = true;
        while (this.controlQueue.length) this.send(this.controlQueue.shift());
        this.emitConnectionState(true);
        break;
      case "control.provisioned":
        if (message.ok) ui.notifications?.info("Foundry MCP: backend service account provisioned.");
        else ui.notifications?.error(`Foundry MCP: backend provisioning failed: ${message.error ?? "unknown error"}`);
        break;
      case "pong":
        break;
      case "ping":
        this.send({ type: "pong", timestamp: message.timestamp });
        break;
    }
  }

  private authenticate(nonce: string, settings: BridgeSettings): void {
    if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 512) {
      this.socket?.close(1008, "invalid challenge");
      return;
    }
    const worldId = game.world?.id;
    const userId = game.user?.id;
    if (!worldId || !userId) return;
    const hmac = createChallengeHmac(settings.bridgeSecret, nonce, worldId, userId);
    this.send({ type: "auth.proof", nonce, worldId, userId, hmac });
  }

  private onClose(settings: BridgeSettings, socket: WebSocket, event: CloseEvent): void {
    // Ignore a close event from a socket replaced by restart().
    if (this.socket !== socket) return;
    this.heartbeat.stop();
    this.socket = undefined;
    this.registered = false;
    this.emitConnectionState(false);
    if (this.stopped) return;
    const delay = this.backoff.next();
    const reason = event.reason ? ` (${event.reason})` : "";
    this.debug(settings, `WebSocket disconnected with code ${event.code}${reason}; retrying in ${delay}ms.`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private dispatchServerMessage(message: AgentControlServerMessage): void {
    for (const handler of this.serverMessageHandlers) handler(message);
  }

  private emitConnectionState(registered: boolean): void {
    if (this.emittedConnectionState === registered) return;
    this.emittedConnectionState = registered;
    for (const handler of this.connectionStateHandlers) handler(registered);
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private debug(settings: BridgeSettings, message: string): void {
    if (settings.diagnostics) console.debug(`Foundry MCP | ${message}`);
  }
}

function createRegistration(): BridgeRegistration {
  return {
    bridgeVersion: APPLICATION_VERSION,
    world: { id: game.world?.id ?? "", title: game.world?.title ?? "" },
    user: { id: game.user?.id ?? "", name: game.user?.name ?? "", isGM: true },
    foundry: { version: game.version },
    system: { id: game.system.id, version: game.system.version },
    capabilities: ["foundry.control.provision", "agentcontrol.control"],
  };
}

export function isAllowedBridgeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "wss:") return true;
    if (url.protocol !== "ws:" || globalThis.location?.protocol !== "http:") return false;
    return isLocalNetworkHostname(url.hostname);
  } catch {
    return false;
  }
}

function isLocalNetworkHostname(hostname: string): boolean {
  if (["127.0.0.1", "localhost", "::1"].includes(hostname)) return true;
  if (hostname.endsWith(".local")) return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const match = /^172\.(\d{1,2})\./.exec(hostname);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}
