import { WebSocket, type RawData } from "ws";

import { AppError } from "../errors.js";
import {
  encodePong,
  encodeSocketConnect,
  encodeSocketEvent,
  parseSessionBinding,
  parseSocketFrame
} from "./socket-protocol.js";

type AckWaiter = {
  label: string;
  resolve: (args: unknown[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

function rawDataToString(data: RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
}

/**
 * Compatibility socket URL: the session travels both in the `?session=`
 * query parameter (v13 binding) and in the `session` cookie on the upgrade
 * request (v14 binding). Each generation reads only the form it understands
 * and ignores the other, so the combination is safe on both.
 */
export function buildSocketUrl(foundryUrl: string, sessionId: string): string {
  const origin = new URL(foundryUrl).origin;
  const url = new URL(origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:"));
  url.pathname = "/socket.io/";
  url.search = `session=${encodeURIComponent(sessionId)}&EIO=4&transport=websocket`;
  return url.toString();
}

export class FoundrySocketConnection {
  private ws: WebSocket | undefined;
  private ackCounter = 0;
  private readonly pending = new Map<number, AckWaiter>();
  private intentionallyClosed = false;
  private sessionUserId?: string;

  constructor(
    private readonly foundryUrl: string,
    private readonly sessionId: string,
    private readonly onClose: (error?: Error) => void = () => undefined
  ) {}

  get userId(): string | undefined {
    return this.sessionUserId;
  }

  async connect(timeoutMs = 15_000): Promise<void> {
    if (this.ws) throw new Error("Socket connection is already started");
    const url = buildSocketUrl(this.foundryUrl, this.sessionId);
    const socket = new WebSocket(url, {
      headers: { cookie: `session=${this.sessionId}` },
      maxPayload: 32 * 1024 * 1024
    });
    this.ws = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => fail(new Error("Timed out waiting for Foundry socket session binding")), timeoutMs);
      timeout.unref();
      const cleanup = () => clearTimeout(timeout);
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      socket.on("error", (error) => {
        fail(error instanceof Error ? error : new Error(String(error)));
        this.handleClose(error instanceof Error ? error : new Error(String(error)));
      });
      socket.on("close", () => {
        fail(new Error("Foundry socket closed before session binding"));
        this.handleClose();
      });
      socket.on("message", (data) => {
        const frame = parseSocketFrame(rawDataToString(data));
        if (frame.type === "engineOpen") {
          this.sendRaw(encodeSocketConnect());
          return;
        }
        if (frame.type === "ping") {
          this.sendRaw(encodePong());
          return;
        }
        if (frame.type === "socketAck") {
          this.settleAck(frame.ackId, frame.args);
          return;
        }
        if (frame.type === "socketEvent" && frame.event === "session") {
          const binding = parseSessionBinding(frame.args);
          if (binding === null) {
            fail(new Error("Foundry did not bind the authenticated session to the socket"));
            return;
          }
          if (binding?.userId) this.sessionUserId = binding.userId;
          succeed();
        }
      });
    });
  }

  emitWithAck(event: string, args: unknown[], timeoutMs: number, label: string): Promise<unknown[]> {
    const socket = this.requireOpenSocket();
    const ackId = ++this.ackCounter;
    return new Promise<unknown[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(ackId);
        reject(new AppError("FOUNDRY_TIMEOUT", `Timeout waiting for ${label}`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(ackId, { label, resolve, reject, timer });
      try {
        socket.send(encodeSocketEvent(event, args, ackId));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(ackId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close(): void {
    this.intentionallyClosed = true;
    const socket = this.ws;
    this.ws = undefined;
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    else if (socket) socket.terminate();
    this.rejectAllPending(new AppError("FOUNDRY_DISCONNECTED", "Foundry socket connection closed"));
  }

  private requireOpenSocket(): WebSocket {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new AppError("FOUNDRY_DISCONNECTED", "Foundry socket is not connected");
    }
    return this.ws;
  }

  private sendRaw(text: string): void {
    try {
      this.ws?.send(text);
    } catch {
      // The close/error handler will reject pending requests.
    }
  }

  private settleAck(ackId: number, args: unknown[]): void {
    const waiter = this.pending.get(ackId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.pending.delete(ackId);
    waiter.resolve(args);
  }

  private rejectAllPending(error: Error): void {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }

  private handleClose(error?: Error): void {
    this.rejectAllPending(error ?? new AppError("FOUNDRY_DISCONNECTED", "Foundry socket connection closed"));
    if (!this.intentionallyClosed) this.onClose(error);
  }
}
