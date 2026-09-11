import {
  BridgeOperation,
  FoundryCreateDocumentsInputSchema,
  FoundryGetDocumentInputSchema,
  FoundrySearchDocumentsInputSchema,
  FoundryUpdateDocumentsInputSchema
} from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerDocumentTools: ToolRegistrar = (server, { router }) => {
  server.registerTool("foundry_search_documents", {
    description: "Search world documents, or a specified compendium, without loading unrelated full documents.",
    inputSchema: FoundrySearchDocumentsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.SEARCH_DOCUMENTS, input, { tool: "foundry_search_documents" })));

  server.registerTool("foundry_get_document", {
    description: "Read a sanitized Foundry document by UUID, optionally selecting fields and embedded documents.",
    inputSchema: FoundryGetDocumentInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.GET_DOCUMENT, input, { tool: "foundry_get_document" })));

  server.registerTool("foundry_create_documents", {
    description: "Create validated root documents in the active Foundry world.",
    inputSchema: FoundryCreateDocumentsInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async (input) => runTool(() => router.route(BridgeOperation.CREATE_DOCUMENTS, input, { tool: "foundry_create_documents" })));

  server.registerTool("foundry_update_documents", {
    description: "Apply explicit validated field changes to Foundry documents by UUID.",
    inputSchema: FoundryUpdateDocumentsInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.UPDATE_DOCUMENTS, input, { tool: "foundry_update_documents" })));
};
