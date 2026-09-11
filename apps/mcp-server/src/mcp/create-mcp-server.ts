import { McpServer } from "@modelcontextprotocol/server";

import { registerTools } from "./register-tools.js";
import type { ToolDependencies } from "./tools/shared.js";

export function createFoundryMcpServer(dependencies: ToolDependencies): McpServer {
  const server = new McpServer(
    { name: "foundry-mcp", version: "0.2.0" },
    {
      capabilities: { tools: {} },
      instructions: [
        "Use foundry_get_context before acting on phrases such as 'this sheet' or 'the selected token'.",
        "Use foundry_get_schema before changing unfamiliar document fields.",
        "Never claim a deletion is complete until foundry_prepare_delete and then foundry_confirm_delete have both succeeded.",
        "Use Plutonium tools only after checking plutonium_get_capabilities."
      ].join(" ")
    }
  );
  registerTools(server, dependencies);
  return server;
}
