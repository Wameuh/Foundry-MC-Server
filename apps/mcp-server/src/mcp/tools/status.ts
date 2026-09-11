import { BridgeOperation, FoundryGetStatusInputSchema } from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerStatusTool: ToolRegistrar = (server, dependencies) => {
  server.registerTool(
    "foundry_get_status",
    {
      description: "Return the active Foundry world, versions, GM bridge and advertised capabilities.",
      inputSchema: FoundryGetStatusInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => runTool(async () => {
      const session = dependencies.sessions.getActive();
      if (!session) return { connected: false, capabilities: [] };
      const live = await dependencies.router.route(BridgeOperation.GET_STATUS, input, { tool: "foundry_get_status" });
      return { connected: true, registration: dependencies.capabilities.get(), status: live };
    })
  );
};
