import { z } from "zod";
import { DocumentReferenceSchema, OperationIdSchema } from "./schemas/common.js";

export const OperationReceiptSchema = z
  .object({
    operationId: OperationIdSchema,
    status: z.enum(["completed", "partial", "skipped", "failed"]),
    provider: z.enum(["foundry", "plutonium", "autoanimations"]),
    providerVersion: z.string().trim().min(1).max(128).optional(),
    created: z.array(DocumentReferenceSchema),
    updated: z.array(DocumentReferenceSchema),
    skipped: z.array(DocumentReferenceSchema),
    warnings: z.array(z.string().max(2048))
  })
  .strict();

export type OperationReceipt = z.infer<typeof OperationReceiptSchema>;
