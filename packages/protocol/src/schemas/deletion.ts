import { z } from "zod";
import { MAX_DOCUMENT_BATCH_SIZE } from "../constants.js";
import { DocumentReferenceSchema, UuidSchema } from "./common.js";

const DeletionTargetsSchema = z
  .array(UuidSchema)
  .min(1)
  .max(MAX_DOCUMENT_BATCH_SIZE)
  .refine((uuids) => new Set(uuids).size === uuids.length, "Deletion targets must be unique");
const ConfirmationTokenSchema = z.string().min(32).max(256);
const TargetHashSchema = z.string().regex(/^[a-f\d]{64}$/i);

export const PrepareDeletionInputSchema = z
  .object({
    uuids: DeletionTargetsSchema,
    reason: z.string().trim().min(1).max(1024).optional()
  })
  .strict();
export type PrepareDeletionInput = z.infer<typeof PrepareDeletionInputSchema>;

export const DeletionPlanSchema = z
  .object({
    confirmationToken: ConfirmationTokenSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    targetHash: TargetHashSchema,
    targets: z.array(DocumentReferenceSchema).min(1).max(MAX_DOCUMENT_BATCH_SIZE),
    consequences: z.array(z.string().max(2048))
  })
  .strict();
export type DeletionPlan = z.infer<typeof DeletionPlanSchema>;

export const ConfirmDeletionInputSchema = z
  .object({
    confirmationToken: ConfirmationTokenSchema,
    targetHash: TargetHashSchema,
    uuids: DeletionTargetsSchema
  })
  .strict();
export type ConfirmDeletionInput = z.infer<typeof ConfirmDeletionInputSchema>;
