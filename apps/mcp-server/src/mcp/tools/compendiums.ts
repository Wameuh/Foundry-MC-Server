import {
  BridgeOperation,
  FoundryImportCompendiumInputSchema,
  FoundrySearchCompendiumsInputSchema
} from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerCompendiumTools: ToolRegistrar = (server, { router }) => {
  server.registerTool("foundry_search_compendiums", {
    description: "Search accessible Foundry compendium indexes.",
    inputSchema: FoundrySearchCompendiumsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.SEARCH_COMPENDIUMS, input, { tool: "foundry_search_compendiums" })));

  server.registerTool("foundry_import_compendium", {
    description: "Import one indexed Foundry compendium document into the world or an Actor.",
    inputSchema: FoundryImportCompendiumInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async (input) => runTool(() => router.route(BridgeOperation.IMPORT_COMPENDIUM, input, { tool: "foundry_import_compendium" })));
};
