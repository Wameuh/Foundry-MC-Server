import {
  BridgeOperation,
  FoundryCreateEmbeddedInputSchema,
  FoundryUpdateEmbeddedInputSchema
} from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerEmbeddedDocumentTools: ToolRegistrar = (server, { router }) => {
  server.registerTool("foundry_create_embedded", {
    description: "Create Items, ActiveEffects or another supported embedded document type on a parent UUID.",
    inputSchema: FoundryCreateEmbeddedInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async (input) => runTool(() => router.route(BridgeOperation.CREATE_EMBEDDED, input, { tool: "foundry_create_embedded" })));

  server.registerTool("foundry_update_embedded", {
    description: "Apply validated updates to embedded Foundry documents on an explicit parent.",
    inputSchema: FoundryUpdateEmbeddedInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(() => router.route(BridgeOperation.UPDATE_EMBEDDED, input, { tool: "foundry_update_embedded" })));
};
