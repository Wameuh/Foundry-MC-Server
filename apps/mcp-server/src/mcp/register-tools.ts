import type { McpServer } from "@modelcontextprotocol/server";

import { registerAutoAnimationsTools } from "./tools/autoanimations.js";
import { registerCompendiumTools } from "./tools/compendiums.js";
import { registerContextTools } from "./tools/context.js";
import { registerDeletionTools } from "./tools/deletion.js";
import { registerDnd5eCharacterTool } from "./tools/dnd5e-character.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerEmbeddedDocumentTools } from "./tools/embedded-documents.js";
import { registerPlutoniumTools } from "./tools/plutonium.js";
import type { ToolDependencies } from "./tools/shared.js";
import { registerStatusTool } from "./tools/status.js";

export function registerTools(server: McpServer, dependencies: ToolDependencies): void {
  registerStatusTool(server, dependencies);
  registerContextTools(server, dependencies);
  registerDocumentTools(server, dependencies);
  registerEmbeddedDocumentTools(server, dependencies);
  registerCompendiumTools(server, dependencies);
  registerDnd5eCharacterTool(server, dependencies);
  registerPlutoniumTools(server, dependencies);
  registerAutoAnimationsTools(server, dependencies);
  registerDeletionTools(server, dependencies);
}
