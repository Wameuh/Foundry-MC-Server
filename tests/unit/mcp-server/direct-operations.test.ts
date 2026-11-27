import { describe, expect, it } from "vitest";

import { AppError } from "../../../apps/mcp-server/src/errors.js";
import type { FoundryDirectClient } from "../../../apps/mcp-server/src/foundry-direct/client.js";
import { DirectFoundryOperations } from "../../../apps/mcp-server/src/foundry-direct/operations.js";

type JsonRecord = Record<string, unknown>;

type FakeStores = {
  world: Record<string, JsonRecord[]>;
  packs?: { id: string; type: string; documents: JsonRecord[] }[];
};

function fakeClient(stores: FakeStores): FoundryDirectClient {
  const client = {
    async getDocuments(documentName: string, operation: JsonRecord): Promise<JsonRecord> {
      const packId = typeof operation["pack"] === "string" ? operation["pack"] : undefined;
      let documents: JsonRecord[];
      if (packId) {
        documents = stores.packs?.find((pack) => pack.id === packId)?.documents ?? [];
      } else {
        // Embedded types have no world collection in this fake; the direct
        // embedded get returns nothing so operations fall back to the parent.
        documents = stores.world[documentName] ?? [];
      }
      const queryId = (operation["query"] as JsonRecord | undefined)?.["_id"];
      const result = typeof queryId === "string"
        ? documents.filter((document) => document["_id"] === queryId)
        : documents;
      return { result: result.map((document) => ({ ...document })) };
    },
    async requestWorldData(): Promise<JsonRecord> {
      return {
        world: { id: "world-one", title: "World One" },
        system: { id: "dnd5e", version: "6.1.1" },
        packs: (stores.packs ?? []).map((pack) => ({ id: pack.id, type: pack.type }))
      };
    }
  };
  return client as unknown as FoundryDirectClient;
}

function operationsFor(stores: FakeStores): DirectFoundryOperations {
  const client = fakeClient(stores);
  return new DirectFoundryOperations(() => Promise.resolve(client));
}

const couatl: JsonRecord = {
  _id: "couatl0000000001",
  name: "Couatl",
  type: "npc",
  items: [
    { _id: "bite000000000001", name: "Bite", type: "weapon", effects: [{ _id: "fxbite0000000001", name: "Poisoned" }] },
    { _id: "constrict00000001", name: "Constrict", type: "weapon", effects: [] },
    { _id: "shieldspell00001", name: "Shield", type: "spell" }
  ],
  effects: []
};

const goblin: JsonRecord = {
  _id: "goblin0000000001",
  name: "Goblin",
  type: "npc",
  items: [
    { _id: "scimitar000000001", name: "Scimitar", type: "weapon" }
  ],
  effects: []
};

const stores: FakeStores = {
  world: { Actor: [couatl, goblin] },
  packs: [
    {
      id: "dnd5e-monsters",
      type: "Actor",
      documents: [{ ...couatl, _id: "compcouatl0000001" }]
    }
  ]
};

describe("DirectFoundryOperations embedded search", () => {
  it("finds embedded items of a world actor by name", async () => {
    const operations = operationsFor(stores);
    const result = await operations.searchDocuments({
      documentType: "Item",
      query: "bite",
      parentUuid: "Actor.couatl0000000001"
    });

    expect(result["total"]).toBe(1);
    const results = result["results"] as JsonRecord[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      uuid: "Actor.couatl0000000001.Item.bite000000000001",
      documentType: "Item",
      name: "Bite",
      parentUuid: "Actor.couatl0000000001"
    });
  });

  it("returns every embedded document of the collection with an empty query", async () => {
    const operations = operationsFor(stores);
    const result = await operations.searchDocuments({
      documentType: "Item",
      query: "",
      parentUuid: "Actor.couatl0000000001"
    });

    expect(result["total"]).toBe(3);
    const names = (result["results"] as JsonRecord[]).map((entry) => entry["name"]);
    expect(names).toEqual(["Bite", "Constrict", "Shield"]);
  });

  it("scopes the search to the requested parent", async () => {
    const operations = operationsFor(stores);
    const result = await operations.searchDocuments({
      documentType: "Item",
      query: "",
      parentUuid: "Actor.goblin0000000001"
    });

    expect(result["total"]).toBe(1);
    expect((result["results"] as JsonRecord[])[0]?.["name"]).toBe("Scimitar");
  });

  it("paginates embedded results with a cursor", async () => {
    const operations = operationsFor(stores);
    const first = await operations.searchDocuments({
      documentType: "Item",
      query: "",
      parentUuid: "Actor.couatl0000000001",
      limit: 2
    });
    expect((first["results"] as JsonRecord[]).map((entry) => entry["name"])).toEqual(["Bite", "Constrict"]);
    expect(typeof first["nextCursor"]).toBe("string");

    const second = await operations.searchDocuments({
      documentType: "Item",
      query: "",
      parentUuid: "Actor.couatl0000000001",
      limit: 2,
      cursor: first["nextCursor"]
    });
    expect((second["results"] as JsonRecord[]).map((entry) => entry["name"])).toEqual(["Shield"]);
    expect(second["nextCursor"]).toBeUndefined();
    expect(second["total"]).toBe(3);
  });

  it("searches embedded documents of an embedded parent", async () => {
    const operations = operationsFor(stores);
    const result = await operations.searchDocuments({
      documentType: "ActiveEffect",
      query: "",
      parentUuid: "Actor.couatl0000000001.Item.bite000000000001"
    });

    expect(result["total"]).toBe(1);
    expect((result["results"] as JsonRecord[])[0]).toMatchObject({
      uuid: "Actor.couatl0000000001.Item.bite000000000001.ActiveEffect.fxbite0000000001",
      documentType: "ActiveEffect",
      name: "Poisoned",
      parentUuid: "Actor.couatl0000000001.Item.bite000000000001"
    });
  });

  it("returns an empty result set when the parent has no such collection", async () => {
    const operations = operationsFor(stores);
    const result = await operations.searchDocuments({
      documentType: "Scene",
      query: "",
      parentUuid: "Actor.couatl0000000001"
    });

    expect(result["total"]).toBe(0);
    expect(result["results"]).toEqual([]);
  });

  it("fails when the parent document does not exist", async () => {
    const operations = operationsFor(stores);
    await expect(
      operations.searchDocuments({
        documentType: "Item",
        query: "",
        parentUuid: "Actor.missing000000001"
      })
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("rejects embedded search inside compendium documents with a clear error", async () => {
    const operations = operationsFor(stores);
    await expect(
      operations.searchDocuments({
        documentType: "Item",
        query: "",
        parentUuid: "Compendium.dnd5e-monsters.compcouatl0000001"
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      operations.searchDocuments({
        documentType: "Item",
        query: "",
        parentUuid: "Compendium.dnd5e-monsters.compcouatl0000001"
      })
    ).rejects.toThrow(/includeEmbedded/);
  });

  it("rejects parentUuid combined with packId or folderId", async () => {
    const operations = operationsFor(stores);
    await expect(
      operations.searchDocuments({
        documentType: "Item",
        parentUuid: "Actor.couatl0000000001",
        packId: "dnd5e-monsters"
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      operations.searchDocuments({
        documentType: "Item",
        parentUuid: "Actor.couatl0000000001",
        folderId: "folder00000000001"
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("keeps world and compendium search behavior unchanged", async () => {
    const operations = operationsFor(stores);
    const world = await operations.searchDocuments({ documentType: "Actor", query: "goblin" });
    expect((world["results"] as JsonRecord[])[0]).toMatchObject({
      uuid: "Actor.goblin0000000001",
      documentType: "Actor",
      name: "Goblin"
    });
    expect((world["results"] as JsonRecord[])[0]?.["parentUuid"]).toBeUndefined();

    const pack = await operations.searchDocuments({ documentType: "Actor", query: "", packId: "dnd5e-monsters" });
    expect((pack["results"] as JsonRecord[])[0]).toMatchObject({
      uuid: "Compendium.dnd5e-monsters.compcouatl0000001",
      packId: "dnd5e-monsters"
    });
  });

  it("throws AppError instances for invalid combinations", async () => {
    const operations = operationsFor(stores);
    const failure = await operations
      .searchDocuments({ documentType: "Item", parentUuid: "Actor.couatl0000000001", packId: "x" })
      .then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
  });
});
