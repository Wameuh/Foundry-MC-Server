import type { BridgeRequest, BridgeResponse } from "@foundry-mcp/protocol";
import { notifyError, notifyResult } from "./notifications";
import { getStatus } from "../operations/status";
import { getContext } from "../operations/context";
import { getSchema } from "../operations/schema";
import { searchDocuments } from "../operations/search-documents";
import { getDocument } from "../operations/get-document";
import { createDocuments } from "../operations/create-documents";
import { updateDocuments } from "../operations/update-documents";
import { createEmbeddedDocuments, updateEmbeddedDocuments } from "../operations/embedded-documents";
import { importCompendium, searchCompendiums } from "../operations/compendium-import";
import { deleteDocuments } from "../operations/delete-documents";
import { prepareDelete } from "../operations/prepare-delete";
import { buildCharacter } from "../dnd5e/actor-builder";
import { refreshPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";
import { importPlutoniumReference } from "../integrations/plutonium/reference-import";
import { importPlutoniumEntries } from "../integrations/plutonium/json-import";
import { refreshAutoAnimationsCapabilities } from "../integrations/autoanimations/capability-probe";
import { getItemAnimation } from "../integrations/autoanimations/get-item-animation";
import { setItemAnimation } from "../integrations/autoanimations/set-item-animation";
import { getAutorecMenus } from "../integrations/autoanimations/get-autorec";
import { searchAnimationCatalog } from "../integrations/autoanimations/search-catalog";
import { OperationError } from "../operations/errors";

type Handler = (payload: unknown, operationId: string) => unknown;

const handlers: Record<string, Handler> = {
  "foundry.getStatus": () => getStatus(),
  "foundry.getContext": () => getContext(),
  "foundry.getSchema": (payload) => getSchema(payload),
  "foundry.searchDocuments": (payload) => searchDocuments(payload),
  "foundry.getDocument": (payload) => getDocument(payload),
  "foundry.createDocuments": createDocuments,
  "foundry.updateDocuments": updateDocuments,
  "foundry.createEmbedded": createEmbeddedDocuments,
  "foundry.updateEmbedded": updateEmbeddedDocuments,
  "foundry.searchCompendiums": (payload) => searchCompendiums(payload),
  "foundry.importCompendium": importCompendium,
  "foundry.deleteDocuments": deleteDocuments,
  "foundry.prepareDelete": (payload) => prepareDelete(payload),
  "dnd5e.buildCharacter": buildCharacter,
  // Plutonium publishes module.api during its own lifecycle. Re-probe here so
  // a bridge that connected before Plutonium finished initializing can recover.
  "plutonium.getCapabilities": () => refreshPlutoniumCapabilities(),
  "plutonium.importReference": importPlutoniumReference,
  "plutonium.importEntries": importPlutoniumEntries,
  // Automated Animations exposes window.AutomatedAnimations after aa.initialize.
  "autoanimations.getCapabilities": () => refreshAutoAnimationsCapabilities(),
  "autoanimations.getItemAnimation": (payload) => getItemAnimation(payload),
  "autoanimations.setItemAnimation": setItemAnimation,
  "autoanimations.getAutorec": () => getAutorecMenus(),
  "autoanimations.searchCatalog": (payload) => searchAnimationCatalog(payload),
};

export async function dispatchRequest(request: BridgeRequest): Promise<BridgeResponse> {
  const { requestId, operationId, operation, payload, deadline } = request;
  try {
    if (!game.user?.isGM) throw new OperationError("FORBIDDEN", "Only an active GM may use the bridge.");
    if (Date.now() > deadline) throw new OperationError("REQUEST_TIMEOUT", "The request deadline has elapsed.");
    const handler = handlers[operation];
    if (!handler) throw new OperationError("INVALID_REQUEST", `Unknown operation ${operation}.`);
    const result = await handler(payload, operationId);
    notifyResult(operation, result);
    return { requestId, ok: true, result } as BridgeResponse;
  } catch (error) {
    notifyError(operation);
    const normalized = normalizeError(error);
    return { requestId, ok: false, error: normalized } as BridgeResponse;
  }
}

function normalizeError(error: unknown) {
  if (error instanceof OperationError) return { code: error.code, message: error.message, details: error.details };
  const message = error instanceof Error ? error.message : "Unknown bridge error.";
  return { code: "INTERNAL_ERROR", message };
}
