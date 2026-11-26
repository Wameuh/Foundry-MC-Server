import type { Logger } from "pino";

import { AppError } from "../errors.js";
import { FoundryDirectClient } from "./client.js";
import type { DirectCredentialStore } from "./credential-store.js";
import { DirectFoundryOperations } from "./operations.js";
import type { DirectBackendStatus, DirectConnectionState, FoundryDirectCredentials } from "./types.js";

export class DirectFoundrySupervisor {
  private client: FoundryDirectClient | undefined;
  private credentials: FoundryDirectCredentials | undefined;
  private state: DirectConnectionState = "unprovisioned";
  private lastError: string | undefined;
  private connectedAt: string | undefined;
  private connecting: Promise<FoundryDirectClient> | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  readonly operations: DirectFoundryOperations;

  constructor(private readonly options: {
    foundryUrl: string;
    targetWorldId: string;
    credentialStore: DirectCredentialStore;
    logger: Logger;
    requestTimeoutMs: number;
    retryMs?: number;
  }) {
    this.operations = new DirectFoundryOperations(() => this.requireClient());
  }

  async start(): Promise<void> {
    this.credentials = await this.options.credentialStore.load();
    if (!this.credentials) {
      this.state = "unprovisioned";
      return;
    }
    void this.connectInBackground();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.state = "stopped";
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.client?.close();
    this.client = undefined;
  }

  async provision(input: Omit<FoundryDirectCredentials, "createdAt" | "updatedAt">): Promise<DirectBackendStatus> {
    if (input.worldId !== this.options.targetWorldId) {
      throw new AppError("INVALID_REQUEST", "Provisioned credentials target the wrong world");
    }
    this.credentials = await this.options.credentialStore.save(input);
    await this.closeClient();
    const client = await this.connectNow();
    return this.status(Boolean(client));
  }

  async requireClient(): Promise<FoundryDirectClient> {
    if (this.client?.connected) return this.client;
    return this.connectNow();
  }

  status(connectedOverride?: boolean): DirectBackendStatus {
    const connected = connectedOverride ?? Boolean(this.client?.connected);
    return {
      state: connected ? "connected" : this.state,
      foundryUrl: this.options.foundryUrl,
      worldId: this.options.targetWorldId,
      ...(this.credentials?.userId ? { userId: this.credentials.userId } : {}),
      ...(this.credentials?.username ? { username: this.credentials.username } : {}),
      ...(this.connectedAt && connected ? { connectedAt: this.connectedAt } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {})
    };
  }

  private connectInBackground(): void {
    void this.connectNow().catch((error) => {
      this.options.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Foundry direct connection failed");
    });
  }

  private async connectNow(): Promise<FoundryDirectClient> {
    if (this.client?.connected) return this.client;
    if (this.connecting) return this.connecting;
    if (!this.credentials) {
      this.state = "unprovisioned";
      throw new AppError("FOUNDRY_UNPROVISIONED", "No backend Foundry account has been provisioned");
    }
    if (this.credentials.worldId !== this.options.targetWorldId) {
      this.state = "error";
      this.lastError = "provisioned credential targets a different world";
      throw new AppError("FOUNDRY_UNPROVISIONED", this.lastError);
    }
    if (this.stopped) throw new AppError("FOUNDRY_DISCONNECTED", "Foundry direct supervisor is stopped");

    this.state = "connecting";
    const credentials = this.credentials;
    this.connecting = (async () => {
      const client = new FoundryDirectClient({
        foundryUrl: this.options.foundryUrl,
        credentials,
        requestTimeoutMs: this.options.requestTimeoutMs,
        onClose: (error) => this.handleSocketClose(error)
      });
      try {
        await client.connect();
        this.client = client;
        this.state = "connected";
        this.connectedAt = new Date().toISOString();
        this.lastError = undefined;
        return client;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.lastError = message;
        this.state = message.includes("world") && message.includes("active") ? "waiting_for_world" : "error";
        this.scheduleRetry();
        throw error;
      } finally {
        this.connecting = undefined;
      }
    })();
    return this.connecting;
  }

  private handleSocketClose(error?: Error): void {
    if (this.stopped) return;
    this.client = undefined;
    this.state = "error";
    this.lastError = error?.message ?? "Foundry socket disconnected";
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.connectInBackground();
    }, this.options.retryMs ?? 10_000);
    this.retryTimer.unref();
  }

  private async closeClient(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.close();
  }
}
