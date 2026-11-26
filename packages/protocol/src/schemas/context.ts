import { z } from "zod";
import { EmptyInputSchema, NonEmptyIdentifierSchema } from "./common.js";

export const FoundryGetStatusInputSchema = EmptyInputSchema;
export type FoundryGetStatusInput = z.infer<typeof FoundryGetStatusInputSchema>;

export const FoundryGetContextInputSchema = EmptyInputSchema;
export type FoundryGetContextInput = z.infer<typeof FoundryGetContextInputSchema>;

export const FoundryGetSchemaInputSchema = z
  .object({
    documentType: NonEmptyIdentifierSchema.optional(),
    subtype: NonEmptyIdentifierSchema.optional()
  })
  .strict();
export type FoundryGetSchemaInput = z.infer<typeof FoundryGetSchemaInputSchema>;
