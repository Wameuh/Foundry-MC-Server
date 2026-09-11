import type { BridgeRegistration } from "@foundry-mcp/protocol";
import type { Logger } from "pino";
import type { WebSocket } from "ws";

import { BridgeSession } from "./bridge-session.js";

export class SessionRegistry {
  private session: BridgeSession | undefined;

  constructor(
    private readonly targetWorldId: string,
    private readonly heartbeatTimeoutMs: number,
    private readonly logger: Logger
  ) {}

  register(socket: WebSocket, registration: BridgeRegistration): BridgeSession {
    if (registration.world.id !== this.targetWorldId) throw new Error("Unexpected Foundry world");
    if (!registration.user.isGM) throw new Error("Foundry bridge user must be a GM");
    const previous = this.session;
    const session = new BridgeSession(socket, registration);
    this.session = session;
    if (previous && previous.socket !== socket) previous.close(4001, "Replaced by a newer GM bridge session");
    this.logger.info(
      { worldId: session.worldId, userId: session.userId, bridgeVersion: registration.bridgeVersion },
      "Foundry bridge registered"
    );
    return session;
  }

  getActive(): BridgeSession | undefined {
    const session = this.session;
    if (!session) return undefined;
    if (!session.isOpen() || Date.now() - session.lastSeen > this.heartbeatTimeoutMs) {
      session.close(4000, "Heartbeat timeout");
      this.clear(session);
      return undefined;
    }
    return session;
  }

  clear(session: BridgeSession): boolean {
    if (this.session === session) {
      this.session = undefined;
      this.logger.info({ worldId: session.worldId, userId: session.userId }, "Foundry bridge disconnected");
      return true;
    }
    return false;
  }

  close(): void {
    this.session?.close(1001, "Server shutting down");
    this.session = undefined;
  }
}
