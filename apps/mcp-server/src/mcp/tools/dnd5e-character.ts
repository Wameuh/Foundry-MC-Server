import { BridgeOperation, BuildCharacterInputSchema } from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerDnd5eCharacterTool: ToolRegistrar = (server, { router }) => {
  server.registerTool("dnd5e_build_character", {
    description: "Create or enrich a D&D5e character, including canonical imports, local items and effects.",
    inputSchema: BuildCharacterInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async (input) => runTool(() => router.route(BridgeOperation.BUILD_CHARACTER, input, { tool: "dnd5e_build_character" })));
};
