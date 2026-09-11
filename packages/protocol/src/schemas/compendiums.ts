import { z } from "zod";
import { MAX_SEARCH_LIMIT } from "../constants.js";
import { EmptyInputSchema, NonEmptyIdentifierSchema, UuidSchema } from "./common.js";

export const FoundrySearchCompendiumsInputSchema = z
  .object({
    query: z.string().max(512).default(""),
    packId: NonEmptyIdentifierSchema.optional(),
    documentType: NonEmptyIdentifierSchema.optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(25),
    cursor: z.string().min(1).max(1024).optional()
  })
  .strict();
export type FoundrySearchCompendiumsInput = z.infer<
  typeof FoundrySearchCompendiumsInputSchema
>;

export const CompendiumReferenceSchema = z
  .object({
    packId: NonEmptyIdentifierSchema,
    label: z.string().min(1).max(512),
    documentType: NonEmptyIdentifierSchema,
    packageName: NonEmptyIdentifierSchema.optional()
  })
  .strict();

export const FoundryCompendiumSearchResultSchema = z
  .object({ packs: z.array(CompendiumReferenceSchema) })
  .strict();
export type FoundryCompendiumSearchResult = z.infer<
  typeof FoundryCompendiumSearchResultSchema
>;

export const FoundryListCompendiumsInputSchema = EmptyInputSchema;
export type FoundryListCompendiumsInput = z.infer<
  typeof FoundryListCompendiumsInputSchema
>;

export const CompendiumImportDestinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("world"), folderId: NonEmptyIdentifierSchema.optional() }).strict(),
  z.object({ type: z.literal("actor"), actorUuid: UuidSchema }).strict()
]);

export const FoundryImportCompendiumInputSchema = z
  .object({
    packId: NonEmptyIdentifierSchema,
    documentId: NonEmptyIdentifierSchema,
    destination: CompendiumImportDestinationSchema
  })
  .strict();
export type FoundryImportCompendiumInput = z.infer<
  typeof FoundryImportCompendiumInputSchema
>;
