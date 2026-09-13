import { z } from "zod";
import {
  EmptyInputSchema,
  SafeJsonObjectSchema,
  UuidSchema
} from "./common.js";

export const AutoAnimationsMenuSchema = z.enum([
  "melee",
  "range",
  "ontoken",
  "templatefx",
  "aura",
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
    menus: z.array(AutoAnimationsMenuSchema),
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

export const AutoAnimationsSetItemInputSchema = z
  .object({
    uuid: UuidSchema,
    menu: AutoAnimationsMenuSchema,
    isEnabled: z.boolean().default(true),
    primary: AutoAnimationsVideoSchema.optional(),
    /** When true, merge onto existing A-A flags when the menu matches. */
    merge: z.boolean().default(true),
    /**
     * Advanced escape hatch: replace the full `flags.autoanimations` object as-is.
     * Unlike the primary-video path, this mode does not rewrite menu/isEnabled/
     * isCustomized/label from the sibling fields; only `version` is filled when missing.
     */
    flags: SafeJsonObjectSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.flags && !value.primary) {
      context.addIssue({
        code: "custom",
        path: ["primary"],
        message: "primary is required unless flags is provided"
      });
    }
  });
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
