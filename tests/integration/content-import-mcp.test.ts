import { describe, expect, it } from "vitest";
import { CapabilityCache } from "../../apps/mcp-server/src/bridge/capability-cache.js";
import type { SessionRegistry } from "../../apps/mcp-server/src/bridge/session-registry.js";
import { LocalContentCatalog } from "../../apps/mcp-server/src/content/catalog.js";
import type { ContentBackendOperations } from "../../apps/mcp-server/src/content/importer.js";
import { ConfirmationStore } from "../../apps/mcp-server/src/deletion/confirmation-store.js";
import { connectMcpClient } from "../helpers/mcp-harness.js";

type JsonRecord = Record<string, unknown>;

function dependencies(backend: ContentBackendOperations) {
  const sessions = { getActive: () => undefined, close: () => undefined } as unknown as SessionRegistry;
  return {
    router: { route: () => Promise.reject(new Error("content test backend is injected directly")) },
    sessions,
    capabilities: new CapabilityCache(),
    confirmations: new ConfirmationStore(60_000),
    contentCatalog: new LocalContentCatalog("/data/Data/modules/plutonium/data"),
    contentBackend: backend
  };
}

function backendFixture(options: { duplicate?: boolean } = {}) {
  const calls: Array<{ method: string; payload: JsonRecord }> = [];
  const backend: ContentBackendOperations = {
    async searchDocuments(payload) {
      calls.push({ method: "searchDocuments", payload });
      return options.duplicate ? { results: [{ uuid: "Item.existing0000000", documentType: "Item", name: "Absorb Elements" }] } : { results: [] };
    },
    async getDocument(payload) {
      calls.push({ method: "getDocument", payload });
      return { document: { uuid: payload["uuid"] }, data: { items: [] } };
    },
    async createDocuments(payload) {
      calls.push({ method: "createDocuments", payload });
      return { created: [{ uuid: "Item.created00000000", documentType: "Item", name: "Absorb Elements" }], deleted: [], results: [] };
    },
    async updateDocuments(payload) {
      calls.push({ method: "updateDocuments", payload });
      return { updated: [{ uuid: "Item.existing0000000", documentType: "Item", name: "Absorb Elements" }], deleted: [], results: [] };
    },
    async createEmbedded(payload) {
      calls.push({ method: "createEmbedded", payload });
      return { created: [{ uuid: `${String(payload["parentUuid"])}.Item.created00000000`, documentType: "Item", name: "Longsword" }], deleted: [], results: [] };
    },
    async updateEmbedded(payload) {
      calls.push({ method: "updateEmbedded", payload });
      return { updated: [], deleted: [], results: [] };
    }
  };
  return { backend, calls };
}

describe("content import MCP tools", () => {
  it("previews Absorb Elements without any backend write", async () => {
    const fixture = backendFixture();
    const connection = await connectMcpClient(dependencies(fixture.backend));
    try {
      const result = await connection.client.callTool({
        name: "content_import_preview",
        arguments: { kind: "spell", name: "Absorb Elements", source: "XGE" }
      });
      const content = result.structuredContent as JsonRecord;
      expect(content["documentType"]).toBe("Item");
      expect((content["document"] as JsonRecord)["type"]).toBe("spell");
      expect(((content["document"] as JsonRecord)["system"] as JsonRecord)["level"]).toBe(1);
      expect(Array.isArray(content["warnings"])).toBe(true);
      expect(fixture.calls.filter((call) => call.method.startsWith("create") || call.method.startsWith("update"))).toEqual([]);
    } finally {
      await connection.close();
    }
  });

  it("commits a new spell through createDocuments and reports the creation receipt", async () => {
    const fixture = backendFixture();
    const connection = await connectMcpClient(dependencies(fixture.backend));
    try {
      const result = await connection.client.callTool({
        name: "content_import_commit",
        arguments: { kind: "spell", name: "Absorb Elements", source: "XGE", destination: { folderId: "Folder001" } }
      });
      const content = result.structuredContent as JsonRecord;
      expect(content["action"]).toBe("created");
      expect(String(content["message"])).toContain("Created");
      expect((content["target"] as JsonRecord)["uuid"]).toBe("Item.created00000000");
      const create = fixture.calls.find((call) => call.method === "createDocuments");
      expect(create?.payload["documentType"]).toBe("Item");
      expect(create?.payload["folderId"]).toBe("Folder001");
      expect((create?.payload["documents"] as JsonRecord[])[0]?.["name"]).toBe("Absorb Elements");
    } finally {
      await connection.close();
    }
  });

  it("updates an existing duplicate when overwrite is true", async () => {
    const fixture = backendFixture({ duplicate: true });
    const connection = await connectMcpClient(dependencies(fixture.backend));
    try {
      const result = await connection.client.callTool({
        name: "content_import_commit",
        arguments: { kind: "spell", name: "Absorb Elements", source: "XGE", options: { overwrite: true } }
      });
      const content = result.structuredContent as JsonRecord;
      expect(content["action"]).toBe("updated");
      expect(String(content["message"])).toContain("Updated existing");
      const update = fixture.calls.find((call) => call.method === "updateDocuments");
      expect((update?.payload["updates"] as JsonRecord[])[0]?.["uuid"]).toBe("Item.existing0000000");
      expect(fixture.calls.some((call) => call.method === "createDocuments")).toBe(false);
    } finally {
      await connection.close();
    }
  });

  it("imports an item into an actor through createEmbedded", async () => {
    const fixture = backendFixture();
    const connection = await connectMcpClient(dependencies(fixture.backend));
    try {
      const result = await connection.client.callTool({
        name: "content_import_commit",
        arguments: { kind: "item", name: "Longsword", source: "PHB", destination: { actorUuid: "Actor.actor0000000000" } }
      });
      const content = result.structuredContent as JsonRecord;
      expect(content["action"]).toBe("created");
      const create = fixture.calls.find((call) => call.method === "createEmbedded");
      expect(create?.payload["embeddedType"]).toBe("Item");
      expect(create?.payload["parentUuid"]).toBe("Actor.actor0000000000");
    } finally {
      await connection.close();
    }
  });
});
