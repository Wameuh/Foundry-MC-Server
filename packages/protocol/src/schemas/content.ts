import { z } from "zod";

export const ContentKindSchema = z.enum(["spell", "item", "creature"]);

export const ContentSearchInputSchema = z.object({
  kind: ContentKindSchema,
  query: z.string().max(200).optional(),
  source: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(100).default(25)
}).strict();

export const ContentGetInputSchema = z.object({
  kind: ContentKindSchema,
  name: z.string().min(1).max(300),
  source: z.string().max(64).optional()
}).strict();
