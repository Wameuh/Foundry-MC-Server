import {
  BridgeOperation,
  FoundryGetContextInputSchema,
  FoundryGetSchemaInputSchema
} from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerContextTools: ToolRegistrar = (server, { router }) => {
  server.registerTool(
    "foundry_get_context",
    {
      description: "Return the active scene, viewed sheet and controlled tokens from the connected GM client.",
      inputSchema: FoundryGetContextInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => runTool(() => router.route(BridgeOperation.GET_CONTEXT, input, { tool: "foundry_get_context" }))
  );

  server.registerTool(
    "foundry_get_schema",
    {
      description: "Return the supported public fields for a Foundry document type and optional subtype.",
      inputSchema: FoundryGetSchemaInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => runTool(() => router.route(BridgeOperation.GET_SCHEMA, input, { tool: "foundry_get_schema" }))
  );
};
