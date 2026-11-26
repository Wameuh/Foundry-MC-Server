import { BridgeOperation, FoundryGetStatusInputSchema } from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

function isDisconnectedStatus(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = (value as Record<string, unknown>)["status"];
  return Boolean(status && typeof status === "object" && !Array.isArray(status) && (status as Record<string, unknown>)["connected"] === false);
}

export const registerStatusTool: ToolRegistrar = (server, dependencies) => {
  server.registerTool(
    "foundry_get_status",
    {
      description: "Return the active Foundry world, versions, backend connection and advertised capabilities.",
      inputSchema: FoundryGetStatusInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => runTool(async () => {
      const live = await dependencies.router.route(BridgeOperation.GET_STATUS, input, { tool: "foundry_get_status" });
      return { connected: !isDisconnectedStatus(live), registration: dependencies.capabilities.get(), status: live };
    })
  );
};
