import { z } from "zod";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

export const DANGEROUS_PROPERTY_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor"
]);

export function findDangerousJsonPath(value: JsonValue): string | undefined {
  const pending: Array<{ path: string; value: JsonValue }> = [{ path: "$", value }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || current.value === null || typeof current.value !== "object") {
      continue;
    }

    if (Array.isArray(current.value)) {
      current.value.forEach((entry, index) => {
        pending.push({ path: `${current.path}[${index}]`, value: entry });
      });
      continue;
    }

    for (const [key, entry] of Object.entries(current.value)) {
      const path = `${current.path}.${key}`;
      if (DANGEROUS_PROPERTY_NAMES.has(key)) return path;
      pending.push({ path, value: entry });
    }
  }

  return undefined;
}

export const SafeJsonObjectSchema = z
  .record(z.string(), JsonValueSchema)
  .superRefine((value, context) => {
    const dangerousPath = findDangerousJsonPath(value);
    if (dangerousPath) {
      context.addIssue({
        code: "custom",
        message: `Dangerous property is forbidden at ${dangerousPath}`
      });
    }
  });

export type SafeJsonObject = z.infer<typeof SafeJsonObjectSchema>;

export const NonEmptyIdentifierSchema = z.string().trim().min(1).max(255);
export const UuidSchema = z.string().trim().min(3).max(1024);
export const RequestIdSchema = z.string().trim().min(8).max(128);
export const OperationIdSchema = z.string().trim().min(8).max(128);
export const IdempotencyKeySchema = z.string().trim().min(8).max(256);

export const DocumentReferenceSchema = z
  .object({
    uuid: UuidSchema,
    documentType: NonEmptyIdentifierSchema,
    name: z.string().min(1).max(512),
    parentUuid: UuidSchema.optional(),
    packId: NonEmptyIdentifierSchema.optional()
  })
  .strict();

export type DocumentReference = z.infer<typeof DocumentReferenceSchema>;

export const EmptyInputSchema = z.object({}).strict();
