import { ContentGetInputSchema, ContentSearchInputSchema } from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerContentTools: ToolRegistrar = (server, dependencies) => {
  server.registerTool("content_search", {
    description: "Search the local Plutonium/5etools JSON catalog without executing browser code.",
    inputSchema: ContentSearchInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(async () => {
    if (!dependencies.contentCatalog) throw new Error("Local content catalog is not configured");
    return dependencies.contentCatalog.search(input);
  }));

  server.registerTool("content_get", {
    description: "Read one local Plutonium/5etools entry and its Foundry overlay data when available.",
    inputSchema: ContentGetInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(async () => {
    if (!dependencies.contentCatalog) throw new Error("Local content catalog is not configured");
    return dependencies.contentCatalog.get(input);
  }));
};
