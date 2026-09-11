import { describe, expect, it, afterEach } from "vitest";
import { BridgeOperation } from "../../packages/protocol/src/index.js";
import { FakeFoundryDocument, installFakeFoundry } from "../helpers/fake-foundry.js";
import { createFakePlutonium } from "../helpers/fake-plutonium.js";

describe("Foundry dispatcher feature journey", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).game;
    delete (globalThis as Record<string, unknown>).CONFIG;
    delete (globalThis as Record<string, unknown>).getDocumentClass;
    delete (globalThis as Record<string, unknown>).fromUuid;
  });

  it("reads an Actor, updates it, and creates an embedded Item", async () => {
    const actor = new FakeFoundryDocument("Actor", "actor-1", "Arannis", undefined, {
      system: { details: { biography: { value: "Old biography" } } },
    });
    installFakeFoundry([actor]);
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true, id: "gm", name: "GM" },
      world: { id: "test-world", title: "Feature World" },
      version: "14.367",
      system: { id: "dnd5e", version: "5.3.3" },
      modules: new Map(),
      collections: new Map([["Actor", { contents: [actor] }]]),
      packs: new Map(),
      settings: { get: () => false },
    };
    (globalThis as Record<string, unknown>).CONFIG = {};
    (globalThis as Record<string, unknown>).ui = { notifications: { info: () => undefined, warn: () => undefined, error: () => undefined } };
    const { dispatchRequest } = await import("../../apps/foundry-module/src/bridge/dispatcher.js");

    const read = await dispatchRequest({
      requestId: "read-1", operationId: "op-read", operation: BridgeOperation.GET_DOCUMENT,
      payload: { uuid: actor.uuid, includeEmbedded: true }, deadline: Date.now() + 1_000,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect((read.result as { data: Record<string, unknown> }).data.name).toBe("Arannis");

    const updated = await dispatchRequest({
      requestId: "update-1", operationId: "op-update", operation: BridgeOperation.UPDATE_DOCUMENTS,
      payload: { updates: [{ uuid: actor.uuid, changes: { name: "Arannis the Swift" } }] }, deadline: Date.now() + 1_000,
    });
    expect(updated.ok).toBe(true);
    expect(actor.name).toBe("Arannis the Swift");

    const item = await dispatchRequest({
      requestId: "item-1", operationId: "op-item", operation: BridgeOperation.CREATE_EMBEDDED,
      payload: { parentUuid: actor.uuid, embeddedType: "Item", documents: [{ name: "Longsword", type: "weapon" }] }, deadline: Date.now() + 1_000,
    });
    expect(item.ok).toBe(true);
    expect(actor.items).toHaveLength(1);
    expect(actor.items[0].name).toBe("Longsword");
  });

  it("imports a supported entry through the Plutonium adapter", async () => {
    const fake = createFakePlutonium();
    let importerProbes = 0;
    const originalGetImporter = fake.api.importer.pGetImporter;
    fake.api.importer.pGetImporter = async (input) => {
      importerProbes += 1;
      return await originalGetImporter(input);
    };
    installFakeFoundry([]);
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true, id: "gm", name: "GM" },
      modules: new Map([["plutonium", { active: true, version: "2.18.3.v14", api: fake.api }]]),
      packs: new Map(),
      settings: { get: () => false },
    };
    (globalThis as Record<string, unknown>).ui = { notifications: { info: () => undefined, warn: () => undefined, error: () => undefined } };
    const { dispatchRequest } = await import("../../apps/foundry-module/src/bridge/dispatcher.js");
    const result = await dispatchRequest({
      requestId: "plutonium-1", operationId: "op-plutonium", operation: BridgeOperation.PLUTONIUM_IMPORT_ENTRIES,
      payload: { entries: [{ prop: "spell", data: { name: "Fireball", source: "PHB", __prop: "spell" } }], destination: { type: "world" } },
      deadline: Date.now() + 1_000,
    });
    expect(result.ok).toBe(true);
    expect(fake.imported).toEqual([{ name: "Fireball", source: "PHB", __prop: "spell" }]);
    expect(importerProbes).toBe(14);
    if (result.ok) expect(result.result).toMatchObject({ provider: "plutonium", status: "completed" });
  });
});
