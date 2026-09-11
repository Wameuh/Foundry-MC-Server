import { z } from "zod";

export const BridgeCapability = {
  STATUS: "foundry.status",
  CONTEXT: "foundry.context",
  SCHEMA: "foundry.schema",
  DOCUMENT_READ: "foundry.documents.read",
  DOCUMENT_CREATE: "foundry.documents.create",
  DOCUMENT_UPDATE: "foundry.documents.update",
  DOCUMENT_DELETE: "foundry.documents.delete",
  EMBEDDED_CREATE: "foundry.embedded.create",
  EMBEDDED_UPDATE: "foundry.embedded.update",
  COMPENDIUM_SEARCH: "foundry.compendiums.search",
  COMPENDIUM_IMPORT: "foundry.compendiums.import",
  DND5E_CHARACTER_BUILD: "dnd5e.character.build",
  PLUTONIUM_CAPABILITIES: "plutonium.capabilities",
  PLUTONIUM_REFERENCE_IMPORT: "plutonium.import.reference",
  PLUTONIUM_JSON_IMPORT: "plutonium.import.json"
} as const;

export const KnownBridgeCapabilitySchema = z.enum(BridgeCapability);
export type KnownBridgeCapability = z.infer<typeof KnownBridgeCapabilitySchema>;

// Forward-compatible: newer bridges may announce capabilities unknown to an older server.
export const BridgeCapabilitySchema = z.string().trim().min(1).max(255);
export type BridgeCapabilityValue = z.infer<typeof BridgeCapabilitySchema>;
