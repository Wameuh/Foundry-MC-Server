import { z } from "zod";
import { MAX_DOCUMENT_BATCH_SIZE, MAX_SEARCH_LIMIT } from "../constants.js";
import {
  DANGEROUS_PROPERTY_NAMES,
  DocumentReferenceSchema,
  JsonValueSchema,
  NonEmptyIdentifierSchema,
  SafeJsonObjectSchema,
  UuidSchema
} from "./common.js";

export const FoundrySearchDocumentsInputSchema = z
  .object({
    documentType: NonEmptyIdentifierSchema,
    query: z.string().max(512).default(""),
    packId: NonEmptyIdentifierSchema.optional(),
    folderId: NonEmptyIdentifierSchema.optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(25),
    cursor: z.string().min(1).max(1024).optional()
  })
  .strict();
export type FoundrySearchDocumentsInput = z.infer<
  typeof FoundrySearchDocumentsInputSchema
>;

export const FoundryGetDocumentInputSchema = z
  .object({
    uuid: UuidSchema,
    paths: z.array(z.string().min(1).max(512)).max(200).optional(),
    includeEmbedded: z.boolean().default(false)
  })
  .strict();
export type FoundryGetDocumentInput = z.infer<typeof FoundryGetDocumentInputSchema>;

export const FoundryDocumentSnapshotSchema = z
  .object({
    document: DocumentReferenceSchema,
    data: SafeJsonObjectSchema
  })
  .strict();
export type FoundryDocumentSnapshot = z.infer<typeof FoundryDocumentSnapshotSchema>;

export const FoundryDocumentSearchResultSchema = z
  .object({
    results: z.array(DocumentReferenceSchema),
    nextCursor: z.string().min(1).max(1024).optional(),
    total: z.number().int().nonnegative()
  })
  .strict();
export type FoundryDocumentSearchResult = z.infer<
  typeof FoundryDocumentSearchResultSchema
>;

export const FoundryCreateDocumentsInputSchema = z
  .object({
    documentType: NonEmptyIdentifierSchema,
    documents: z.array(SafeJsonObjectSchema).min(1).max(MAX_DOCUMENT_BATCH_SIZE),
    folderId: NonEmptyIdentifierSchema.optional()
  })
  .strict();
export type FoundryCreateDocumentsInput = z.infer<
  typeof FoundryCreateDocumentsInputSchema
>;

export const UpdatePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (path) =>
      !path
        .split(".")
        .some(
          (segment) =>
            DANGEROUS_PROPERTY_NAMES.has(segment) ||
            ["_id", "uuid", "parent", "pack", "apps", "collection"].includes(segment)
        ),
    "Update path contains a forbidden property"
  );

export const DocumentUpdateSchema = z
  .object({
    uuid: UuidSchema,
    changes: z
      .record(UpdatePathSchema, JsonValueSchema)
      .refine((changes) => Object.keys(changes).length > 0, "At least one change is required")
  })
  .strict();

export const FoundryUpdateDocumentsInputSchema = z
  .object({
    updates: z.array(DocumentUpdateSchema).min(1).max(MAX_DOCUMENT_BATCH_SIZE)
  })
  .strict();
export type FoundryUpdateDocumentsInput = z.infer<
  typeof FoundryUpdateDocumentsInputSchema
>;
