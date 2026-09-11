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
    auditLogPath: "/tmp/foundry-mcp-feature-test.jsonl",
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

describe("MCP client feature journey", () => {
  it("lists the real registered tools and reports no bridge when Foundry is offline", async () => {
    const connection = await connectMcpClient(dependencies());
    try {
      const tools = await connection.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "foundry_get_status",
        "foundry_get_context",
        "foundry_update_documents",
        "plutonium_import_entries",
      ]));

      const status = await connection.client.callTool({ name: "foundry_get_status", arguments: {} });
      expect(status.structuredContent).toEqual({ connected: false, capabilities: [] });
    } finally {
      await connection.close();
    }
  });
});
