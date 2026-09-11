import type { BridgeResponse } from "@foundry-mcp/protocol";

import { AppError } from "../errors.js";

type Pending = {
  resolve: (response: BridgeResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class PendingRequests {
  private readonly requests = new Map<string, Pending>();

  wait(requestId: string, timeoutMs: number): Promise<BridgeResponse> {
    if (this.requests.has(requestId)) throw new Error(`Duplicate request id: ${requestId}`);
    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new AppError("BRIDGE_TIMEOUT", "Foundry bridge operation timed out"));
      }, timeoutMs);
      timer.unref();
      this.requests.set(requestId, { resolve, reject, timer });
    });
  }

  settle(response: BridgeResponse): boolean {
    const pending = this.requests.get(response.requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.requests.delete(response.requestId);
    pending.resolve(response);
    return true;
  }

  rejectAll(error = new AppError("BRIDGE_DISCONNECTED", "Foundry bridge disconnected")): void {
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.requests.clear();
  }
}
