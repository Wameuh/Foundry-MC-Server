import { AppError } from "../errors.js";
import { fetchFoundryApiStatus, joinFoundryWorld } from "./auth.js";
import { FoundrySocketConnection } from "./connection.js";
import type { FoundryDirectCredentials } from "./types.js";

export type DocumentOperationOptions = {
  parentUuid?: string;
  pack?: string;
};

export type FoundryDirectClientOptions = {
  foundryUrl: string;
  credentials: Pick<FoundryDirectCredentials, "userId" | "username" | "password">;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
  onClose?: (error?: Error) => void;
};

function withParentUuid(base: Record<string, unknown>, options?: DocumentOperationOptions): Record<string, unknown> {
  return {
    ...base,
    ...(options?.parentUuid ? { parentUuid: options.parentUuid } : {})
  };
}

function errorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = (value as Record<string, unknown>)["message"];
    if (typeof message === "string") return message;
  }
  return "Foundry rejected the document operation";
}

function throwOnFoundryError(response: Record<string, unknown>): Record<string, unknown> {
  if (response["error"] !== undefined) {
    throw new AppError("FOUNDRY_OPERATION_FAILED", errorMessage(response["error"]), {
      foundryError: response["error"]
    });
  }
  return response;
}

export class FoundryDirectClient {
  private socket: FoundrySocketConnection | undefined;
  private worldSnapshot: Record<string, unknown> | undefined;
  private worldSnapshotPromise: Promise<Record<string, unknown>> | undefined;

  constructor(private readonly options: FoundryDirectClientOptions) {}

  get connected(): boolean {
    return Boolean(this.socket);
  }

  async connect(): Promise<void> {
    if (this.socket) return;
    const status = await fetchFoundryApiStatus(this.options.foundryUrl);
    if (!status.active) {
      throw new AppError("FOUNDRY_WORLD_INACTIVE", "No Foundry world is currently active");
    }
    const join = await joinFoundryWorld(this.options.foundryUrl, this.options.credentials);
    const socket = new FoundrySocketConnection(
      this.options.foundryUrl,
      join.sessionId,
      this.options.onClose ?? (() => undefined)
    );
    await socket.connect(this.options.connectTimeoutMs ?? 15_000);
    if (socket.userId && socket.userId !== this.options.credentials.userId) {
      socket.close();
      throw new AppError("FOUNDRY_AUTH_FAILED", "Foundry bound the socket to an unexpected user");
    }
    this.socket = socket;
  }

  async close(): Promise<void> {
    this.socket?.close();
    this.socket = undefined;
    this.worldSnapshot = undefined;
    this.worldSnapshotPromise = undefined;
  }

  invalidateWorldSnapshot(): void {
    this.worldSnapshot = undefined;
  }

  async requestWorldData(forceRefresh = false): Promise<Record<string, unknown>> {
    if (!forceRefresh && this.worldSnapshot) return this.worldSnapshot;
    if (!forceRefresh && this.worldSnapshotPromise) return this.worldSnapshotPromise;
    const promise = this.emitWithAck("world", [], "world data").then((payload) => {
      const world = payload[0];
      if (!world || typeof world !== "object" || Array.isArray(world)) {
        throw new AppError("FOUNDRY_PROTOCOL_ERROR", "Foundry returned an invalid world payload");
      }
      this.worldSnapshot = world as Record<string, unknown>;
      return this.worldSnapshot;
    }).finally(() => {
      this.worldSnapshotPromise = undefined;
    });
    this.worldSnapshotPromise = promise;
    return promise;
  }

  async getDocuments(
    documentName: string,
    operation: Record<string, unknown>,
    options: { logLabel?: string } = {}
  ): Promise<Record<string, unknown>> {
    const response = await this.sendModifyDocumentRequest(
      documentName,
      "get",
      operation,
      options.logLabel ?? `get ${documentName}`,
      (candidate) => Array.isArray(candidate["result"])
    );
    return throwOnFoundryError(response);
  }

  async createDocuments(
    documentName: string,
    data: Record<string, unknown>[],
    options: DocumentOperationOptions = {}
  ): Promise<Record<string, unknown>> {
    const operation = withParentUuid({
      pack: options.pack ?? null,
      data,
      action: "create",
      modifiedTime: Date.now(),
      renderSheet: false,
      render: false
    }, options);
    const response = await this.sendModifyDocumentRequest(
      documentName,
      "create",
      operation,
      `create ${documentName}`,
      (candidate) => candidate["action"] === "create"
    );
    this.invalidateWorldSnapshot();
    return throwOnFoundryError(response);
  }

  async updateDocuments(
    documentName: string,
    updates: Record<string, unknown>[],
    options: DocumentOperationOptions = {}
  ): Promise<Record<string, unknown>> {
    const operation = withParentUuid({
      diff: true,
      pack: options.pack ?? null,
      updates,
      action: "update",
      modifiedTime: Date.now(),
      recursive: true,
      render: false
    }, options);
    const response = await this.sendModifyDocumentRequest(
      documentName,
      "update",
      operation,
      `update ${documentName}`,
      (candidate) => candidate["action"] === "update"
    );
    this.invalidateWorldSnapshot();
    return throwOnFoundryError(response);
  }

  async deleteDocuments(
    documentName: string,
    ids: string[],
    options: DocumentOperationOptions = {}
  ): Promise<Record<string, unknown>> {
    const operation = withParentUuid({
      pack: options.pack ?? null,
      ids,
      action: "delete",
      modifiedTime: Date.now(),
      deleteAll: false,
      render: false
    }, options);
    const response = await this.sendModifyDocumentRequest(
      documentName,
      "delete",
      operation,
      `delete ${documentName}`,
      (candidate) => candidate["action"] === "delete"
    );
    this.invalidateWorldSnapshot();
    return throwOnFoundryError(response);
  }

  private async sendModifyDocumentRequest(
    documentName: string,
    action: "get" | "create" | "update" | "delete",
    operation: Record<string, unknown>,
    label: string,
    isMatch: (response: Record<string, unknown>) => boolean
  ): Promise<Record<string, unknown>> {
    const payload = await this.emitWithAck(
      "modifyDocument",
      [{ type: documentName, action, operation }],
      label
    );
    const response = payload[0];
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new AppError("FOUNDRY_PROTOCOL_ERROR", `Invalid ${label} response`);
    }
    const record = response as Record<string, unknown>;
    if (record["error"] !== undefined) return record;
    if (record["type"] !== documentName || !isMatch(record)) {
      throw new AppError("FOUNDRY_PROTOCOL_ERROR", `Unexpected ${label} response for ${documentName}`);
    }
    return record;
  }

  private async emitWithAck(event: string, args: unknown[], label: string): Promise<unknown[]> {
    if (!this.socket) throw new AppError("FOUNDRY_DISCONNECTED", "Foundry direct client is not connected");
    return this.socket.emitWithAck(event, args, this.options.requestTimeoutMs ?? 30_000, label);
  }
}
