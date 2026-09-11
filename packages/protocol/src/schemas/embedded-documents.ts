import { z } from "zod";
import { MAX_DOCUMENT_BATCH_SIZE } from "../constants.js";
import { NonEmptyIdentifierSchema, SafeJsonObjectSchema, UuidSchema } from "./common.js";
import { DocumentUpdateSchema } from "./documents.js";

export const FoundryCreateEmbeddedInputSchema = z
  .object({
    parentUuid: UuidSchema,
    embeddedType: NonEmptyIdentifierSchema,
    documents: z.array(SafeJsonObjectSchema).min(1).max(MAX_DOCUMENT_BATCH_SIZE)
  })
  .strict();
export type FoundryCreateEmbeddedInput = z.infer<
  typeof FoundryCreateEmbeddedInputSchema
>;

export const FoundryUpdateEmbeddedInputSchema = z
  .object({
    parentUuid: UuidSchema,
    embeddedType: NonEmptyIdentifierSchema,
    updates: z.array(DocumentUpdateSchema).min(1).max(MAX_DOCUMENT_BATCH_SIZE)
  })
  .strict();
export type FoundryUpdateEmbeddedInput = z.infer<
  typeof FoundryUpdateEmbeddedInputSchema
>;
