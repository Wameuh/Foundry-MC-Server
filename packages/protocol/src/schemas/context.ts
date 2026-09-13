import { z } from "zod";
import { DocumentReferenceSchema, EmptyInputSchema, NonEmptyIdentifierSchema, UuidSchema } from "./common.js";
import { AutoAnimationsCapabilitiesSchema } from "./autoanimations.js";
import { PlutoniumCapabilitiesSchema } from "./plutonium.js";

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

export const FoundryContextSchema = z
  .object({
    activeScene: DocumentReferenceSchema.optional(),
    viewedDocument: DocumentReferenceSchema.optional(),
    selectedTokens: z
      .array(
        z
          .object({
            tokenUuid: UuidSchema,
            actorUuid: UuidSchema.optional(),
            name: z.string().min(1).max(512)
          })
          .strict()
      )
      .max(100)
  })
  .strict();

export type FoundryContext = z.infer<typeof FoundryContextSchema>;

export const FoundryStatusSchema = z
  .object({
    connected: z.boolean(),
    world: z
      .object({ id: NonEmptyIdentifierSchema, title: z.string().min(1).max(512) })
      .strict()
      .optional(),
    foundry: z.object({ version: z.string().min(1).max(128) }).strict(),
    system: z
      .object({ id: NonEmptyIdentifierSchema, version: z.string().min(1).max(128) })
      .strict(),
    user: z
      .object({
        id: NonEmptyIdentifierSchema,
        name: z.string().min(1).max(512),
        isGM: z.boolean()
      })
      .strict()
      .optional(),
    plutonium: PlutoniumCapabilitiesSchema.optional(),
    autoanimations: AutoAnimationsCapabilitiesSchema.optional()
  })
  .strict();
export type FoundryStatus = z.infer<typeof FoundryStatusSchema>;

export const FoundrySchemaDescriptionSchema = z
  .object({
    system: z
      .object({ id: NonEmptyIdentifierSchema, version: z.string().min(1).max(128) })
      .strict(),
    documentTypes: z.array(NonEmptyIdentifierSchema),
    immutablePaths: z.array(z.string().min(1).max(512)),
    note: z.string().max(4096)
  })
  .strict();
export type FoundrySchemaDescription = z.infer<
  typeof FoundrySchemaDescriptionSchema
>;
