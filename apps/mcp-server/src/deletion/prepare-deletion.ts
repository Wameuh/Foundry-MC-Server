import { BridgeOperation, DocumentReferenceSchema, type DocumentReference } from "@foundry-mcp/protocol";
import { z } from "zod/v4";

import { AppError } from "../errors.js";
import type { RequestRouter } from "../bridge/request-router.js";
import type { ConfirmationStore } from "./confirmation-store.js";

const PreviewSchema = z.object({
  targets: z.array(DocumentReferenceSchema).min(1),
  consequences: z.array(z.string()).default([])
});

export type PreparedDeletion = {
  confirmationToken: string;
  expiresAt: string;
  targetHash: string;
  targets: DocumentReference[];
  consequences: string[];
};

export async function prepareDeletion(
  router: RequestRouter,
  confirmations: ConfirmationStore,
  input: { uuids: string[]; reason?: string }
): Promise<PreparedDeletion> {
  const preview = PreviewSchema.parse(await router.route(BridgeOperation.PREPARE_DELETE, input, { tool: "foundry_prepare_delete" }));
  const expected = new Set(input.uuids);
  if (preview.targets.length !== expected.size || preview.targets.some((target) => !expected.has(target.uuid))) {
    throw new AppError("DELETE_PREVIEW_MISMATCH", "Foundry returned a deletion preview for different targets");
  }
  const pending = confirmations.create(input.uuids);
  return {
    confirmationToken: pending.token,
    expiresAt: new Date(pending.expiresAt).toISOString(),
    targetHash: pending.targetHash,
    targets: preview.targets,
    consequences: preview.consequences
  };
}
