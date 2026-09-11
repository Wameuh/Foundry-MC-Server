import { McpServer } from "@modelcontextprotocol/server";
import { APPLICATION_VERSION } from "@foundry-mcp/protocol";

import { buildServerInstructions, loadAgentRules, registerAgentRules } from "./agent-rules.js";
import { registerTools } from "./register-tools.js";
import type { ToolDependencies } from "./tools/shared.js";

export function createFoundryMcpServer(dependencies: ToolDependencies): McpServer {
  const agentRules = loadAgentRules();
  const server = new McpServer(
    { name: "foundry-mcp", version: APPLICATION_VERSION },
    {
      capabilities: { resources: {}, tools: {} },
      instructions: buildServerInstructions(agentRules),
    }
  );
  registerAgentRules(server);
  registerTools(server, dependencies);
  return server;
}
