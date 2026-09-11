import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createFoundryMcpServer } from "../../apps/mcp-server/src/mcp/create-mcp-server.js";
import type { ToolDependencies } from "../../apps/mcp-server/src/mcp/tools/shared.js";

export async function connectMcpClient(dependencies: ToolDependencies) {
  const handler = createMcpHandler(() => createFoundryMcpServer(dependencies), { legacy: "stateless" });
  const transport = new StreamableHTTPClientTransport(new URL("http://mcp.test/mcp"), {
    fetch: async (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: "feature-test-client", version: "0.1.0" });
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
