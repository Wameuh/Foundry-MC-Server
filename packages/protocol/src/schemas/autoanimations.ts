import { z } from "zod";
import {
  EmptyInputSchema,
  SafeJsonObjectSchema,
  UuidSchema
} from "./common.js";

/** Menus supported by the simplified primary-video write path. */
export const AutoAnimationsSimplifiedMenuSchema = z.enum([
  "melee",
  "range",
  "ontoken",
  "templatefx",
  "aura"
]);
export type AutoAnimationsSimplifiedMenu = z.infer<typeof AutoAnimationsSimplifiedMenuSchema>;

/**
 * All A-A item menus, including `preset`.
 * Presets require the advanced `flags` replace mode because they need `presetType` + `data`.
 */
export const AutoAnimationsMenuSchema = z.enum([
  ...AutoAnimationsSimplifiedMenuSchema.options,
  "preset"
]);
export type AutoAnimationsMenu = z.infer<typeof AutoAnimationsMenuSchema>;

export const AutoAnimationsGetCapabilitiesInputSchema = EmptyInputSchema;
export type AutoAnimationsGetCapabilitiesInput = z.infer<
  typeof AutoAnimationsGetCapabilitiesInputSchema
>;

export const AutoAnimationsCapabilitiesSchema = z
  .object({
    active: z.boolean(),
    version: z.string().trim().min(1).max(128).optional(),
    compatible: z.boolean(),
    itemRead: z.boolean(),
    itemWrite: z.boolean(),
    autorecRead: z.boolean(),
    catalogSearch: z.boolean(),
    /** Menus writable via the simplified `primary` path (excludes preset). */
    menus: z.array(AutoAnimationsSimplifiedMenuSchema),
    reason: z.string().max(2048).optional()
  })
  .strict();
export type AutoAnimationsCapabilities = z.infer<typeof AutoAnimationsCapabilitiesSchema>;

export const AutoAnimationsVideoSchema = z
  .object({
    dbSection: z.string().trim().min(1).max(64).optional(),
    menuType: z.string().trim().min(1).max(128),
    animation: z.string().trim().min(1).max(128),
    variant: z.string().trim().min(1).max(128).default("01"),
    color: z.string().trim().min(1).max(128).default("blue"),
    enableCustom: z.boolean().optional(),
    customPath: z.string().trim().max(2048).optional()
  })
  .strict();
export type AutoAnimationsVideo = z.infer<typeof AutoAnimationsVideoSchema>;

export const AutoAnimationsGetItemInputSchema = z
  .object({
    uuid: UuidSchema
  })
  .strict();
export type AutoAnimationsGetItemInput = z.infer<typeof AutoAnimationsGetItemInputSchema>;

export const AutoAnimationsSetPrimaryInputSchema = z
  .object({
    uuid: UuidSchema,
    menu: AutoAnimationsSimplifiedMenuSchema,
    isEnabled: z.boolean().default(true),
    merge: z.boolean().default(true),
    primary: AutoAnimationsVideoSchema
  })
  .strict();
export type AutoAnimationsSetPrimaryInput = z.infer<typeof AutoAnimationsSetPrimaryInputSchema>;

export const AutoAnimationsSetFlagsInputSchema = z
  .object({
    uuid: UuidSchema,
    /**
     * Full `flags.autoanimations` replacement. Required for `preset` menus
     * (`presetType` + preset-specific `data`). Sibling primary fields are not accepted.
     */
    flags: SafeJsonObjectSchema
  })
  .strict();
export type AutoAnimationsSetFlagsInput = z.infer<typeof AutoAnimationsSetFlagsInputSchema>;

/** Exactly one of primary-video mode or full-flags replace mode. */
export const AutoAnimationsSetItemInputSchema = z.union([
  AutoAnimationsSetPrimaryInputSchema,
  AutoAnimationsSetFlagsInputSchema
]);
export type AutoAnimationsSetItemInput = z.infer<typeof AutoAnimationsSetItemInputSchema>;

export const AutoAnimationsGetAutorecInputSchema = EmptyInputSchema;
export type AutoAnimationsGetAutorecInput = z.infer<typeof AutoAnimationsGetAutorecInputSchema>;

export const AutoAnimationsSearchCatalogInputSchema = z
  .object({
    query: z.string().trim().min(1).max(256).optional(),
    dbSection: z.enum(["melee", "range", "static", "templatefx", "return"]).optional(),
    menuType: z.string().trim().min(1).max(128).optional(),
    limit: z.number().int().min(1).max(200).default(50)
  })
  .strict();
export type AutoAnimationsSearchCatalogInput = z.infer<
  typeof AutoAnimationsSearchCatalogInputSchema
>;
