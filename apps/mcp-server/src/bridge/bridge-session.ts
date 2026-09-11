import type { BridgeRegistration, BridgeRequest } from "@foundry-mcp/protocol";
import type { WebSocket } from "ws";

export class BridgeSession {
  private lastSeenAt = Date.now();

  constructor(
    public readonly socket: WebSocket,
    public readonly registration: BridgeRegistration
  ) {}

  get worldId(): string {
    return this.registration.world.id;
  }

  get userId(): string {
    return this.registration.user.id;
  }

  get lastSeen(): number {
    return this.lastSeenAt;
  }

  touch(): void {
    this.lastSeenAt = Date.now();
  }

  isOpen(): boolean {
    return this.socket.readyState === 1;
  }

  sendRequest(request: BridgeRequest): void {
    if (!this.isOpen()) throw new Error("Foundry bridge is disconnected");
    this.socket.send(JSON.stringify({ type: "request", request }));
  }

  send(message: unknown): void {
    if (this.isOpen()) this.socket.send(JSON.stringify(message));
  }

  close(code = 1000, reason = "Session closed"): void {
    this.socket.close(code, reason);
  }
}
