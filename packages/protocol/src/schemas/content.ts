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

export const ContentImportDestinationSchema = z.object({
  folderId: z.string().trim().min(1).max(255).optional(),
  actorUuid: z.string().trim().min(3).max(1024).optional()
}).strict().refine(
  (destination) => !(destination.folderId && destination.actorUuid),
  "Choose either folderId or actorUuid, not both"
);

export const ContentImportOptionsSchema = z.object({
  overwrite: z.boolean().default(false)
}).strict().default({ overwrite: false });

export const ContentImportInputSchema = z.object({
  kind: ContentKindSchema,
  name: z.string().min(1).max(300),
  source: z.string().max(64).optional(),
  destination: ContentImportDestinationSchema.default({}),
  options: ContentImportOptionsSchema
}).strict().superRefine((input, context) => {
  if (input.destination.actorUuid && input.kind !== "item") {
    context.addIssue({
      code: "custom",
      path: ["destination", "actorUuid"],
      message: "Only items can be imported into an actor"
    });
  }
});
export type ContentImportInput = z.infer<typeof ContentImportInputSchema>;
