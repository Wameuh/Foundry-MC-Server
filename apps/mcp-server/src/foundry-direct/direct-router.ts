import { BridgeOperation, type BridgeOperationValue } from "@foundry-mcp/protocol";
import type { Logger } from "pino";

import type { AuditLog } from "../audit/audit-log.js";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { assertSafeJson } from "../security/safe-json.js";
import type { DirectFoundrySupervisor } from "./supervisor.js";

type CachedOperation = { expiresAt: number; promise: Promise<unknown> };

function newId(): string {
  return crypto.randomUUID();
}

export class DirectRequestRouter {
  private readonly idempotency = new Map<string, CachedOperation>();

  constructor(
    private readonly direct: DirectFoundrySupervisor,
    private readonly audit: AuditLog,
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {}

  route(operation: BridgeOperationValue, payload: unknown, options: { idempotencyKey?: string; tool?: string } = {}): Promise<unknown> {
    assertSafeJson(payload);
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

  private async dispatch(operation: BridgeOperationValue, payload: unknown, options: { tool?: string }): Promise<unknown> {
    const startedAt = Date.now();
    const operationId = newId();
    try {
      const result = await this.execute(operation, payload, operationId);
      await this.writeAudit(options.tool ?? operation, operationId, startedAt, result, "completed");
      return result;
    } catch (error) {
      const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
      await this.audit.write({
        timestamp: new Date().toISOString(),
        operationId,
        tool: options.tool ?? operation,
        worldId: this.config.targetWorldId,
        userId: this.direct.status().userId ?? "unprovisioned",
        provider: operation.startsWith("plutonium.") ? "plutonium" : "foundry",
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: code
      });
      this.logger.warn({ operationId, operation, code }, "Direct Foundry operation failed");
      throw error;
    }
  }

  private async execute(operation: BridgeOperationValue, payload: unknown, operationId: string): Promise<unknown> {
    const operations = this.direct.operations;
    switch (operation) {
      case BridgeOperation.GET_STATUS:
        return {
          backend: this.direct.status(),
          status: await operations.getStatus()
        };
      case BridgeOperation.GET_CONTEXT:
        return {
          limited: true,
          reason: "direct_backend_has_no_browser_context",
          backend: this.direct.status()
        };
      case BridgeOperation.GET_SCHEMA:
        return {
          backend: "direct",
          immutablePaths: ["_id", "uuid", "parent", "pack", "apps", "collection"],
          note: "Documents are validated and written through the Foundry server socket protocol; client-side DataModel behavior is not executed."
        };
      case BridgeOperation.SEARCH_DOCUMENTS:
        return operations.searchDocuments(payload);
      case BridgeOperation.GET_DOCUMENT:
        return operations.getDocument(payload);
      case BridgeOperation.CREATE_DOCUMENTS:
        return operations.createDocuments(payload, operationId);
      case BridgeOperation.UPDATE_DOCUMENTS:
        return operations.updateDocuments(payload, operationId);
      case BridgeOperation.CREATE_EMBEDDED:
        return operations.createEmbedded(payload, operationId);
      case BridgeOperation.UPDATE_EMBEDDED:
        return operations.updateEmbedded(payload, operationId);
      case BridgeOperation.DELETE_DOCUMENTS:
        return operations.deleteDocuments(payload, operationId);
      case BridgeOperation.PREPARE_DELETE:
        return operations.prepareDelete(payload);
      case BridgeOperation.SEARCH_COMPENDIUMS:
        return operations.searchCompendiums(payload);
      case BridgeOperation.IMPORT_COMPENDIUM:
        return operations.importCompendium(payload, operationId);
      case BridgeOperation.BUILD_CHARACTER:
        throw new AppError("UNSUPPORTED_OPERATION", "dnd5e.buildCharacter is being rewritten for the direct backend");
      case BridgeOperation.PLUTONIUM_GET_CAPABILITIES:
        return {
          active: false,
          compatible: false,
          backendReplacement: "local-content-catalog",
          reason: "browser Plutonium runtime execution has been removed"
        };
      case BridgeOperation.PLUTONIUM_IMPORT_REFERENCE:
      case BridgeOperation.PLUTONIUM_IMPORT_ENTRIES:
        throw new AppError("PLUTONIUM_UNAVAILABLE", "Runtime Plutonium imports require a browser client and are replaced by the local content importer");
      case BridgeOperation.CONFIRM_DELETE:
        throw new AppError("UNSUPPORTED_OPERATION", "confirmDelete is orchestrated by the server, not routed directly");
      default:
        throw new AppError("UNSUPPORTED_OPERATION", `Unsupported operation ${String(operation)}`);
    }
  }

  private async writeAudit(
    tool: string,
    operationId: string,
    startedAt: number,
    result: unknown,
    fallbackStatus: "completed" | "partial" | "skipped" | "failed"
  ): Promise<void> {
    const record = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : undefined;
    const statusValue = record?.["status"];
    const status = typeof statusValue === "string" && ["completed", "partial", "skipped", "failed"].includes(statusValue)
      ? statusValue as "completed" | "partial" | "skipped" | "failed"
      : fallbackStatus;
    const targetCandidates = [record?.["created"], record?.["updated"], record?.["deleted"], record?.["targets"]]
      .filter(Array.isArray).flat();
    const targets = targetCandidates.length
      ? targetCandidates.map((candidate) => summarizeTarget(candidate)).filter((candidate) => candidate !== undefined)
      : undefined;
    await this.audit.write({
      timestamp: new Date().toISOString(),
      operationId,
      tool,
      worldId: this.config.targetWorldId,
      userId: this.direct.status().userId ?? "unprovisioned",
      provider: record?.["provider"] === "plutonium" ? "plutonium" : "foundry",
      ...(targets ? { targets } : {}),
      status,
      durationMs: Date.now() - startedAt
    });
  }
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
