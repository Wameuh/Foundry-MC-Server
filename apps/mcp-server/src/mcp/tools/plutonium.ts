import {
  BridgeOperation,
  PlutoniumEntriesImportSchema,
  PlutoniumGetCapabilitiesInputSchema,
  PlutoniumReferenceImportSchema
} from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerPlutoniumTools: ToolRegistrar = (server, { router }) => {
  server.registerTool("plutonium_get_capabilities", {
    description: "Report the compatible public Plutonium import APIs and importers available in Foundry.",
    inputSchema: PlutoniumGetCapabilitiesInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.PLUTONIUM_GET_CAPABILITIES, input, { tool: "plutonium_get_capabilities" })));

  server.registerTool("plutonium_import_reference", {
    description: "Resolve and import one deterministic Plutonium reference into the Foundry world.",
    inputSchema: PlutoniumReferenceImportSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.PLUTONIUM_IMPORT_REFERENCE, input, { tool: "plutonium_import_reference" })));

  server.registerTool("plutonium_import_entries", {
    description: "Import validated 5etools-format entries through the public Plutonium importer API.",
    inputSchema: PlutoniumEntriesImportSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.PLUTONIUM_IMPORT_ENTRIES, input, { tool: "plutonium_import_entries" })));
};
