import { BridgeOperation, FoundryGetStatusInputSchema } from "@foundry-mcp/protocol";

import { AppError } from "../../errors.js";
import { runTool, type ToolRegistrar } from "./shared.js";

export const registerStatusTool: ToolRegistrar = (server, dependencies) => {
  server.registerTool(
    "foundry_get_status",
    {
      description: "Return the active Foundry world, versions, backend connection and advertised capabilities.",
      inputSchema: FoundryGetStatusInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => runTool(async () => {
      try {
        const live = await dependencies.router.route(BridgeOperation.GET_STATUS, input, { tool: "foundry_get_status" });
        return { connected: true, registration: dependencies.capabilities.get(), status: live };
      } catch (error) {
        if (error instanceof AppError && error.code === "BRIDGE_DISCONNECTED") {
          return { connected: false, capabilities: [] };
        }
        throw error;
      }
    })
  );
};
