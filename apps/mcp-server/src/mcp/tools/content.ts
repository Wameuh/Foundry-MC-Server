import {
  ContentGetInputSchema,
  ContentImportInputSchema,
  ContentSearchInputSchema
} from "@foundry-mcp/protocol";

import { RouterContentBackend } from "../../content/backend-router.js";
import { ContentImporter } from "../../content/importer.js";
import { runTool, type ToolRegistrar } from "./shared.js";

function contentImporter(dependencies: Parameters<ToolRegistrar>[1]): ContentImporter {
  if (!dependencies.contentCatalog) throw new Error("Local content catalog is not configured");
  const backend = dependencies.contentBackend ?? new RouterContentBackend(dependencies.router);
  return new ContentImporter(dependencies.contentCatalog, backend);
}

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

  server.registerTool("content_import_preview", {
    description: "Deterministically convert one local Plutonium/5etools spell, item, or creature into the exact Foundry document JSON that would be written, without writing anything.",
    inputSchema: ContentImportInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) => runTool(async () => contentImporter(dependencies).preview(input)));

  server.registerTool("content_import_commit", {
    description: "Convert and write one local Plutonium/5etools spell, item, or creature through the direct Foundry backend. Refuses duplicate names unless overwrite is true.",
    inputSchema: ContentImportInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async (input) => runTool(async () => contentImporter(dependencies).commit(input)));
};
