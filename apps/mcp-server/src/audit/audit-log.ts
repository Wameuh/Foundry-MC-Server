import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Logger } from "pino";

import { redactAuditValue } from "./redact.js";

export type AuditEvent = {
  timestamp: string;
  operationId: string;
  tool: string;
  worldId?: string;
  userId?: string;
  provider?: "foundry" | "plutonium" | "autoanimations";
  targets?: unknown[];
  status: "completed" | "partial" | "skipped" | "failed";
  durationMs: number;
  errorCode?: string;
};

export class AuditLog {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string, private readonly logger: Logger) {}

  write(event: AuditEvent): Promise<void> {
    const line = `${JSON.stringify(redactAuditValue(event))}\n`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, line, { encoding: "utf8", mode: 0o600 });
      })
      .catch((error: unknown) => {
        this.logger.error({ error }, "Failed to append audit event");
      });
    return this.writeQueue;
  }
}
