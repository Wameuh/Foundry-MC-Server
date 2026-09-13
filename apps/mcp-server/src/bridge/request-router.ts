import { randomUUID } from "node:crypto";

import { BridgeRequestSchema, type BridgeOperationValue, type BridgeResponse } from "@foundry-mcp/protocol";
import type { Logger } from "pino";

import type { AuditLog } from "../audit/audit-log.js";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { assertSafeJson } from "../security/safe-json.js";
import type { PendingRequests } from "./pending-requests.js";
import type { SessionRegistry } from "./session-registry.js";

type CachedOperation = { expiresAt: number; promise: Promise<unknown> };

export class RequestRouter {
  private readonly idempotency = new Map<string, CachedOperation>();

  constructor(
    private readonly sessions: SessionRegistry,
    private readonly pending: PendingRequests,
    private readonly audit: AuditLog,
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {}

  route(operation: BridgeOperationValue, payload: unknown, options: { idempotencyKey?: string; tool?: string } = {}): Promise<unknown> {
    assertSafeJson(payload);
    this.pruneIdempotency();
    if (options.idempotencyKey) {
      const key = `${operation}:${options.idempotencyKey}`;
      const cached = this.idempotency.get(key);
      if (cached) return cached.promise;
      const promise = this.dispatch(operation, payload, options);
      this.idempotency.set(key, { expiresAt: Date.now() + 15 * 60_000, promise });
      promise.catch(() => this.idempotency.delete(key));
      return promise;
    }
    return this.dispatch(operation, payload, options);
  }

  private async dispatch(
    operation: BridgeOperationValue,
    payload: unknown,
    options: { idempotencyKey?: string; tool?: string }
  ): Promise<unknown> {
    const session = this.sessions.getActive();
    if (!session) throw new AppError("BRIDGE_DISCONNECTED", "No active Foundry GM bridge is connected");
    const requestId = randomUUID();
    const operationId = randomUUID();
    const timeoutMs = operation.startsWith("plutonium.")
      ? this.config.plutoniumOperationTimeoutMs
      : this.config.normalOperationTimeoutMs;
    const request = BridgeRequestSchema.parse({
      requestId,
      operationId,
      operation,
      payload,
      deadline: Date.now() + timeoutMs,
      idempotencyKey: options.idempotencyKey
    });
    const startedAt = Date.now();
    const responsePromise = this.pending.wait(requestId, timeoutMs);

    try {
      session.sendRequest(request);
      const response = await responsePromise;
      if (!response.ok) {
        throw new AppError(response.error.code, response.error.message, response.error.details);
      }
      await this.writeAudit(options.tool ?? operation, operationId, startedAt, response, session.worldId, session.userId);
      return response.result;
    } catch (error) {
      const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
      await this.audit.write({
        timestamp: new Date().toISOString(),
        operationId,
        tool: options.tool ?? operation,
        worldId: session.worldId,
        userId: session.userId,
        provider: providerForOperation(operation),
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: code
      });
      this.logger.warn({ operationId, operation, code }, "Bridge operation failed");
      throw error;
    }
  }

  private async writeAudit(
    tool: string,
    operationId: string,
    startedAt: number,
    response: Extract<BridgeResponse, { ok: true }>,
    worldId: string,
    userId: string
  ): Promise<void> {
    const result = response.result as Record<string, unknown> | null;
    const status = result && ["completed", "partial", "skipped", "failed"].includes(String(result["status"]))
      ? (result["status"] as "completed" | "partial" | "skipped" | "failed")
      : "completed";
    const provider =
      result?.["provider"] === "plutonium" || result?.["provider"] === "autoanimations"
        ? result["provider"]
        : "foundry";
    const targetCandidates = [result?.["created"], result?.["updated"], result?.["deleted"], result?.["targets"]]
      .filter(Array.isArray)
      .flat();
    const targets = targetCandidates.length
      ? targetCandidates.map((candidate) => summarizeTarget(candidate)).filter((candidate) => candidate !== undefined)
      : undefined;
    await this.audit.write({
      timestamp: new Date().toISOString(),
      operationId,
      tool,
      worldId,
      userId,
      provider,
      ...(targets ? { targets } : {}),
      status,
      durationMs: Date.now() - startedAt
    });
  }

  private pruneIdempotency(): void {
    const now = Date.now();
    for (const [key, value] of this.idempotency) if (value.expiresAt <= now) this.idempotency.delete(key);
  }
}

function providerForOperation(operation: BridgeOperationValue): "foundry" | "plutonium" | "autoanimations" {
  if (operation.startsWith("plutonium.")) return "plutonium";
  if (operation.startsWith("autoanimations.")) return "autoanimations";
  return "foundry";
}

function summarizeTarget(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["uuid"] !== "string") return undefined;
  const summary: Record<string, string> = { uuid: record["uuid"] };
  for (const key of ["documentType", "name", "parentUuid", "packId"] as const) {
    if (typeof record[key] === "string") summary[key] = record[key];
  }
  return summary;
}
