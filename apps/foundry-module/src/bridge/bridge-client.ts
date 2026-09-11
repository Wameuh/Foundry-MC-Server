import type { BridgeRegistration, BridgeRequest } from "@foundry-mcp/protocol";
import { createChallengeHmac } from "./authenticate";
import { dispatchRequest } from "./dispatcher";
import { Heartbeat } from "./heartbeat";
import { ReconnectBackoff } from "./reconnect";
import { readSettings, type BridgeSettings } from "../settings/read-settings";
import { getPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";

type ServerMessage =
  | { type: "auth.challenge"; nonce: string; issuedAt: number }
  | { type: "auth.accepted" }
  | { type: "request"; request: BridgeRequest }
  | { type: "ping" | "pong"; timestamp: number };

export class BridgeClient {
  private socket: WebSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
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
  }

  /** Restart the bridge using the current module settings. */
  restart(): void {
    this.stop();
    this.backoff.reset();
    this.start();
  }

  private connect(): void {
    if (this.stopped || !game.user?.isGM) return;
    const settings = readSettings();
    if (!settings.bridgeUrl || !settings.bridgeSecret) return;
    if (!isAllowedBridgeUrl(settings.bridgeUrl)) {
      ui.notifications?.error("Foundry MCP: use WSS, or WS only from an HTTP page on a local network.");
      return;
    }
    const socket = new WebSocket(settings.bridgeUrl);
    this.socket = socket;
    socket.addEventListener("open", () => this.debug(settings, "WebSocket connected; awaiting challenge."));
    socket.addEventListener("message", (event) => void this.onMessage(event, settings));
    socket.addEventListener("close", () => this.onClose(settings, socket));
    socket.addEventListener("error", () => this.debug(settings, "WebSocket error."));
  }

  private async onMessage(event: MessageEvent, settings: BridgeSettings): Promise<void> {
    this.heartbeat.touch();
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      this.socket?.close(1003, "invalid JSON");
      return;
    }
    if (!message || typeof message !== "object" || typeof message.type !== "string") return;
    switch (message.type) {
      case "auth.challenge":
        await this.authenticate(message.nonce, settings);
        break;
      case "auth.accepted":
        this.backoff.reset();
        this.heartbeat.start();
        this.send({ type: "register", registration: createRegistration() });
        break;
      case "request": {
        const response = await dispatchRequest(message.request);
        this.send({ type: "response", response });
        break;
      }
      case "pong":
        break;
      case "ping":
        this.send({ type: "pong", timestamp: message.timestamp });
        break;
    }
  }

  private async authenticate(nonce: string, settings: BridgeSettings): Promise<void> {
    if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 512) {
      this.socket?.close(1008, "invalid challenge");
      return;
    }
    const worldId = game.world?.id;
    const userId = game.user?.id;
    if (!worldId || !userId) return;
    const hmac = await createChallengeHmac(settings.bridgeSecret, nonce, worldId, userId);
    this.send({ type: "auth.proof", nonce, worldId, userId, hmac });
  }

  private onClose(settings: BridgeSettings, socket: WebSocket): void {
    // Ignore a close event from a socket replaced by restart().
    if (this.socket !== socket) return;
    this.heartbeat.stop();
    this.socket = undefined;
    if (this.stopped) return;
    const delay = this.backoff.next();
    this.debug(settings, `WebSocket disconnected; retrying in ${delay}ms.`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private debug(settings: BridgeSettings, message: string): void {
    if (settings.diagnostics) console.debug(`Foundry MCP | ${message}`);
  }
}

function createRegistration(): BridgeRegistration {
  const plutonium = getPlutoniumCapabilities();
  return {
    bridgeVersion: "0.2.0",
    world: { id: game.world?.id ?? "", title: game.world?.title ?? "" },
    user: { id: game.user?.id ?? "", name: game.user?.name ?? "", isGM: true },
    foundry: { version: game.version },
    system: { id: game.system.id, version: game.system.version },
    modules: {
      plutonium: {
        active: plutonium.active,
        ...(plutonium.version ? { version: plutonium.version } : {}),
        compatible: plutonium.compatible,
      },
    },
    capabilities: [
      "foundry.documents.read",
      "foundry.status",
      "foundry.context",
      "foundry.schema",
      "foundry.documents.create",
      "foundry.documents.update",
      "foundry.documents.delete",
      "foundry.embedded.create",
      "foundry.embedded.update",
      "foundry.compendiums.search",
      "foundry.compendiums.import",
      "dnd5e.character.build",
      "plutonium.capabilities",
      ...(plutonium.importJson ? ["plutonium.import.json"] : []),
      ...(plutonium.importReference ? ["plutonium.import.reference"] : []),
    ],
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
