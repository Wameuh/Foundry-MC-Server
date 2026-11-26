import { describe, expect, it } from "vitest";
import { CapabilityCache } from "../../apps/mcp-server/src/bridge/capability-cache.js";
import type { SessionRegistry } from "../../apps/mcp-server/src/bridge/session-registry.js";
import { ConfirmationStore } from "../../apps/mcp-server/src/deletion/confirmation-store.js";
import { connectMcpClient } from "../helpers/mcp-harness.js";

function dependencies(route: () => Promise<unknown>) {
  const sessions = { getActive: () => undefined, close: () => undefined } as unknown as SessionRegistry;
  return {
    router: { route },
    sessions,
    capabilities: new CapabilityCache(),
    confirmations: new ConfirmationStore(60_000),
  };
}

describe("MCP client feature journey", () => {
  it("lists the registered backend-direct tools without legacy browser import tools", async () => {
    const connection = await connectMcpClient(dependencies(() => Promise.resolve({
      backend: { state: "disconnected" },
      status: { connected: false, reason: "not provisioned" }
    })));
    try {
      const tools = await connection.client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        "foundry_get_status",
        "foundry_get_context",
        "foundry_update_documents",
        "content_search",
        "content_import_preview",
        "content_import_commit",
      ]));
      expect(names).not.toContain("plutonium_import_entries");
      expect(names).not.toContain("plutonium_import_reference");
      expect(names).not.toContain("plutonium_get_capabilities");
      expect(names).not.toContain("dnd5e_build_character");

      const status = await connection.client.callTool({ name: "foundry_get_status", arguments: {} });
      expect(status.structuredContent).toEqual(expect.objectContaining({ connected: false }));
    } finally {
      await connection.close();
    }
  });
});
