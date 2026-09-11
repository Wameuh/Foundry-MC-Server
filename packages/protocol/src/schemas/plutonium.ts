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

// Plutonium's creature importer is exposed as `creature` at the MCP boundary,
// while 5etools creature JSON uses `monster` as its data property.
export const PlutoniumDataPropSchema = z.enum([
  ...PlutoniumImporterTypeSchema.options,
  "monster"
]);
export type PlutoniumDataProp = z.infer<typeof PlutoniumDataPropSchema>;

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
        __prop: PlutoniumDataPropSchema
      })
    )
  })
  .strict()
  .superRefine((entry, context) => {
    const isCanonicalAlias = entry.prop === "creature" && entry.data.__prop === "monster";
    const isMatchingNonCreature = entry.prop !== "creature" && entry.prop === entry.data.__prop;
    if (!isCanonicalAlias && !isMatchingNonCreature) {
      context.addIssue({
        code: "custom",
        path: ["data", "__prop"],
        message: "data.__prop must match prop or its Plutonium data alias"
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
