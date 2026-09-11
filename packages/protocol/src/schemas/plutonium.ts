import { z } from "zod";
import { MAX_PLUTONIUM_ENTRY_BATCH_SIZE } from "../constants.js";
import {
  EmptyInputSchema,
  NonEmptyIdentifierSchema,
  SafeJsonObjectSchema,
  UuidSchema
} from "./common.js";

export const PlutoniumGetCapabilitiesInputSchema = EmptyInputSchema;
export type PlutoniumGetCapabilitiesInput = z.infer<
  typeof PlutoniumGetCapabilitiesInputSchema
>;

export const PlutoniumImporterTypeSchema = z.enum([
  "creature",
  "spell",
  "item",
  "class",
  "subclass",
  "race",
  "background",
  "feat",
  "optionalfeature",
  "condition",
  "disease",
  "vehicle",
  "object",
  "table"
]);
export type PlutoniumImporterType = z.infer<typeof PlutoniumImporterTypeSchema>;

export const PlutoniumCapabilitiesSchema = z
  .object({
    active: z.boolean(),
    version: z.string().trim().min(1).max(128).optional(),
    compatible: z.boolean(),
    importReference: z.boolean(),
    importJson: z.boolean(),
    importers: z.array(PlutoniumImporterTypeSchema),
    destinations: z.array(z.enum(["world", "actor", "pack"])),
    reason: z.string().max(2048).optional()
  })
  .strict();
export type PlutoniumCapabilities = z.infer<typeof PlutoniumCapabilitiesSchema>;

export const PlutoniumReferenceImportSchema = z
  .object({
    type: PlutoniumImporterTypeSchema,
    name: z.string().trim().min(1).max(512),
    source: z.string().trim().min(1).max(128),
    destination: z.object({ type: z.literal("world") }).strict()
  })
  .strict();
export type PlutoniumReferenceImport = z.infer<
  typeof PlutoniumReferenceImportSchema
>;

export const PlutoniumEntrySchema = z
  .object({
    prop: PlutoniumImporterTypeSchema,
    data: SafeJsonObjectSchema.and(
      z.object({
        name: z.string().trim().min(1).max(512),
        source: z.string().trim().min(1).max(128),
        __prop: PlutoniumImporterTypeSchema
      })
    )
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.prop !== entry.data.__prop) {
      context.addIssue({
        code: "custom",
        path: ["data", "__prop"],
        message: "data.__prop must match prop"
      });
    }
  });

export const PlutoniumImportDestinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("world"), folderId: NonEmptyIdentifierSchema.optional() }).strict(),
  z.object({ type: z.literal("actor"), actorUuid: UuidSchema }).strict(),
  z.object({ type: z.literal("pack"), packId: NonEmptyIdentifierSchema }).strict()
]);

export const PlutoniumEntriesImportSchema = z
  .object({
    entries: z.array(PlutoniumEntrySchema).min(1).max(MAX_PLUTONIUM_ENTRY_BATCH_SIZE),
    destination: PlutoniumImportDestinationSchema
  })
  .strict();
export type PlutoniumEntriesImport = z.infer<typeof PlutoniumEntriesImportSchema>;
