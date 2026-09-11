import { z } from "zod";
import { BridgeCapabilitySchema } from "./capabilities.js";
import { ProtocolErrorSchema } from "./errors.js";
import {
  IdempotencyKeySchema,
  JsonValueSchema,
  NonEmptyIdentifierSchema,
  OperationIdSchema,
  RequestIdSchema
} from "./schemas/common.js";

export const BridgeRegistrationSchema = z
  .object({
    bridgeVersion: z.string().trim().min(1).max(128),
    world: z
      .object({
        id: NonEmptyIdentifierSchema,
        title: z.string().trim().min(1).max(512)
      })
      .strict(),
    user: z
      .object({
        id: NonEmptyIdentifierSchema,
        name: z.string().trim().min(1).max(512),
        isGM: z.literal(true)
      })
      .strict(),
    foundry: z.object({ version: z.string().trim().min(1).max(128) }).strict(),
    system: z
      .object({
        id: NonEmptyIdentifierSchema,
        version: z.string().trim().min(1).max(128)
      })
      .strict(),
    modules: z
      .object({
        plutonium: z
          .object({
            active: z.boolean(),
            version: z.string().trim().min(1).max(128).optional(),
            compatible: z.boolean()
          })
          .strict()
          .optional()
      })
      .strict(),
    capabilities: z.array(BridgeCapabilitySchema).max(256)
  })
  .strict();

export type BridgeRegistration = z.infer<typeof BridgeRegistrationSchema>;

export const BridgeOperation = {
  GET_STATUS: "foundry.getStatus",
  GET_CONTEXT: "foundry.getContext",
  GET_SCHEMA: "foundry.getSchema",
  SEARCH_DOCUMENTS: "foundry.searchDocuments",
  GET_DOCUMENT: "foundry.getDocument",
  CREATE_DOCUMENTS: "foundry.createDocuments",
  UPDATE_DOCUMENTS: "foundry.updateDocuments",
  CREATE_EMBEDDED: "foundry.createEmbedded",
  UPDATE_EMBEDDED: "foundry.updateEmbedded",
  DELETE_DOCUMENTS: "foundry.deleteDocuments",
  SEARCH_COMPENDIUMS: "foundry.searchCompendiums",
  IMPORT_COMPENDIUM: "foundry.importCompendium",
  BUILD_CHARACTER: "dnd5e.buildCharacter",
  PLUTONIUM_GET_CAPABILITIES: "plutonium.getCapabilities",
  PLUTONIUM_IMPORT_REFERENCE: "plutonium.importReference",
  PLUTONIUM_IMPORT_ENTRIES: "plutonium.importEntries",
  PREPARE_DELETE: "foundry.prepareDelete",
  CONFIRM_DELETE: "foundry.confirmDelete"
} as const;

export const BridgeOperationSchema = z.enum(BridgeOperation);
export type BridgeOperationValue = z.infer<typeof BridgeOperationSchema>;

export const BridgeRequestSchema = z
  .object({
    requestId: RequestIdSchema,
    operationId: OperationIdSchema,
    operation: BridgeOperationSchema,
    payload: JsonValueSchema,
    deadline: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema.optional()
  })
  .strict();

export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;

export const BridgeSuccessResponseSchema = z
  .object({
    requestId: RequestIdSchema,
    ok: z.literal(true),
    result: JsonValueSchema
  })
  .strict();

export const BridgeErrorResponseSchema = z
  .object({
    requestId: RequestIdSchema,
    ok: z.literal(false),
    error: ProtocolErrorSchema
  })
  .strict();

export const BridgeResponseSchema = z.discriminatedUnion("ok", [
  BridgeSuccessResponseSchema,
  BridgeErrorResponseSchema
]);

export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

export const BridgeAuthChallengeSchema = z
  .object({
    type: z.literal("auth.challenge"),
    nonce: z.string().min(32).max(256),
    issuedAt: z.number().int().positive()
  })
  .strict();

export const BridgeAuthProofSchema = z
  .object({
    type: z.literal("auth.proof"),
    nonce: z.string().min(32).max(256),
    worldId: NonEmptyIdentifierSchema,
    userId: NonEmptyIdentifierSchema,
    hmac: z.string().regex(/^[a-f\d]{64}$/i)
  })
  .strict();

export const BridgeHeartbeatSchema = z
  .object({
    type: z.enum(["ping", "pong"]),
    timestamp: z.number().int().positive()
  })
  .strict();

export type BridgeAuthChallenge = z.infer<typeof BridgeAuthChallengeSchema>;
export type BridgeAuthProof = z.infer<typeof BridgeAuthProofSchema>;
export type BridgeHeartbeat = z.infer<typeof BridgeHeartbeatSchema>;
