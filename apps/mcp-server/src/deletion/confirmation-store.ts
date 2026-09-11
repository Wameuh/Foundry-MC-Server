import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { AppError } from "../errors.js";

export type PendingDeletion = {
  token: string;
  targetHash: string;
  uuids: string[];
  expiresAt: number;
};

function normalizeUuids(uuids: string[]): string[] {
  return [...new Set(uuids)].sort();
}

export function hashDeletionTargets(uuids: string[]): string {
  return createHash("sha256").update(JSON.stringify(normalizeUuids(uuids)), "utf8").digest("hex");
}

export class ConfirmationStore {
  private readonly pending = new Map<string, PendingDeletion>();

  constructor(private readonly ttlMs: number) {}

  create(uuids: string[]): PendingDeletion {
    this.prune();
    const normalized = normalizeUuids(uuids);
    const token = randomBytes(32).toString("base64url");
    const entry = {
      token,
      targetHash: hashDeletionTargets(normalized),
      uuids: normalized,
      expiresAt: Date.now() + this.ttlMs
    };
    this.pending.set(token, entry);
    return structuredClone(entry);
  }

  consume(input: { confirmationToken: string; targetHash: string; uuids: string[] }): PendingDeletion {
    const entry = this.pending.get(input.confirmationToken);
    if (!entry) throw new AppError("DELETE_CONFIRMATION_INVALID", "Deletion confirmation is invalid or expired");
    if (entry.expiresAt <= Date.now()) {
      this.pending.delete(input.confirmationToken);
      throw new AppError("DELETE_CONFIRMATION_EXPIRED", "Deletion confirmation has expired");
    }
    this.prune();

    const actualHash = Buffer.from(hashDeletionTargets(input.uuids), "hex");
    const suppliedHash = /^[a-f\d]{64}$/i.test(input.targetHash)
      ? Buffer.from(input.targetHash, "hex")
      : Buffer.alloc(0);
    const expectedHash = Buffer.from(entry.targetHash, "hex");
    const hashMatches = suppliedHash.length === expectedHash.length
      && timingSafeEqual(suppliedHash, expectedHash)
      && timingSafeEqual(actualHash, expectedHash);
    if (!hashMatches) throw new AppError("DELETE_TARGET_CHANGED", "Deletion targets do not match the prepared plan");

    this.pending.delete(input.confirmationToken);
    return structuredClone(entry);
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, entry] of this.pending) if (entry.expiresAt <= now) this.pending.delete(token);
  }
}
