import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { AuditLog } from "../../apps/mcp-server/src/audit/audit-log.js";
import { CapabilityCache } from "../../apps/mcp-server/src/bridge/capability-cache.js";
import { PendingRequests } from "../../apps/mcp-server/src/bridge/pending-requests.js";
import { RequestRouter } from "../../apps/mcp-server/src/bridge/request-router.js";
import { SessionRegistry } from "../../apps/mcp-server/src/bridge/session-registry.js";
import { ConfirmationStore } from "../../apps/mcp-server/src/deletion/confirmation-store.js";
import type { AppConfig } from "../../apps/mcp-server/src/config.js";
import { connectMcpClient } from "../helpers/mcp-harness.js";

function dependencies() {
  const config = {
    normalOperationTimeoutMs: 100,
    plutoniumOperationTimeoutMs: 100,
    bridgeHeartbeatTimeoutMs: 60_000,
    targetWorldId: "test-world",
    auditLogPath: "/tmp/foundry-mcp-agent-rules-feature-test.jsonl",
  } as AppConfig;
  const logger = pino({ level: "silent" });
  const sessions = new SessionRegistry(config.targetWorldId, config.bridgeHeartbeatTimeoutMs, logger);
  const pending = new PendingRequests();
  return {
    router: new RequestRouter(sessions, pending, new AuditLog(config.auditLogPath, logger), config, logger),
    sessions,
    capabilities: new CapabilityCache(),
    confirmations: new ConfirmationStore(60_000),
  };
}

describe("MCP agent rules feature journey", () => {
  it("publishes agent rules through instructions, a resource, and a read-only tool", async () => {
    const agentRules = readFileSync(new URL("../../agent_rules.md", import.meta.url), "utf8");
    const expectedPhrase = "Ne jamais laisser de marqueurs techniques visibles";
    expect(agentRules).toContain(expectedPhrase);
    const connection = await connectMcpClient(dependencies());

    try {
      expect(connection.client.getInstructions()).toContain(expectedPhrase);

      const resources = await connection.client.listResources();
      expect(resources.resources).toEqual(expect.arrayContaining([
        expect.objectContaining({
          uri: "foundry://agent-rules",
          mimeType: "text/markdown",
        }),
      ]));

      const resource = await connection.client.readResource({ uri: "foundry://agent-rules" });
      expect(resource.contents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          uri: "foundry://agent-rules",
          mimeType: "text/markdown",
          text: expect.stringContaining(expectedPhrase),
        }),
      ]));

      const tools = await connection.client.listTools();
      expect(tools.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "foundry_get_agent_rules" }),
      ]));

      const toolResult = await connection.client.callTool({
        name: "foundry_get_agent_rules",
        arguments: {},
      });
      expect(toolResult.content).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining(expectedPhrase),
        }),
      ]));
    } finally {
      await connection.close();
    }
  });
});
