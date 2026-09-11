import { z } from "zod";
import { SafeJsonObjectSchema, UuidSchema } from "./common.js";

export const AbilityKeySchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

export const PlutoniumCharacterImportSchema = z
  .object({
    provider: z.literal("plutonium"),
    type: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(512),
    source: z.string().trim().min(1).max(128)
  })
  .strict();

export const CompendiumCharacterImportSchema = z
  .object({
    provider: z.literal("compendium"),
    type: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(512),
    packId: z.string().trim().min(1).max(255),
    documentId: z.string().trim().min(1).max(255)
  })
  .strict();

export const CharacterImportSchema = z.discriminatedUnion("provider", [
  PlutoniumCharacterImportSchema,
  CompendiumCharacterImportSchema
]);

export const BuildCharacterInputSchema = z
  .object({
    name: z.string().trim().min(1).max(512),
    actorUuid: UuidSchema.optional(),
    image: z.string().trim().min(1).max(2048).optional(),
    abilities: z
      .object({
        str: z.number().int().min(1).max(30).optional(),
        dex: z.number().int().min(1).max(30).optional(),
        con: z.number().int().min(1).max(30).optional(),
        int: z.number().int().min(1).max(30).optional(),
        wis: z.number().int().min(1).max(30).optional(),
        cha: z.number().int().min(1).max(30).optional()
      })
      .strict()
      .optional(),
    biography: z.string().max(100_000).optional(),
    imports: z.array(CharacterImportSchema).max(50).optional(),
    items: z.array(SafeJsonObjectSchema).max(50).optional(),
    effects: z.array(SafeJsonObjectSchema).max(50).optional()
  })
  .strict();

export type BuildCharacterInput = z.infer<typeof BuildCharacterInputSchema>;
