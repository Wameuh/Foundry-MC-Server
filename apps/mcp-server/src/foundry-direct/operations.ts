import { AppError } from "../errors.js";
import type { FoundryDirectClient } from "./client.js";
import {
  compendiumUuid,
  documentReferenceFromData,
  embeddedUuid,
  parseFoundryUuid,
  worldUuid
} from "./uuid.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, name = "payload"): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("INVALID_REQUEST", `${name} must be an object`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new AppError("INVALID_REQUEST", `${name} must be a non-empty string`);
  return value;
}

function asArray(value: unknown, name: string, max = 50): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new AppError("INVALID_REQUEST", `${name} must contain between 1 and ${max} entries`);
  }
  return value;
}

function emptyReceipt(operationId: string): JsonRecord {
  return {
    operationId,
    status: "completed",
    provider: "foundry",
    created: [],
    updated: [],
    skipped: [],
    warnings: []
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64");
}

function decodeCursor(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "string") throw new AppError("INVALID_REQUEST", "cursor must be a string");
  const offset = Number(Buffer.from(value, "base64").toString("utf8"));
  if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError("INVALID_REQUEST", "Invalid cursor");
  return offset;
}

function pickPaths(source: JsonRecord, paths?: string[]): JsonRecord {
  if (!paths?.length) return source;
  const output: JsonRecord = {};
  for (const path of paths) {
    const parts = path.split(".").filter(Boolean);
    let current: unknown = source;
    for (const part of parts) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as JsonRecord)[part];
    }
    if (current === undefined) continue;
    let target = output;
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) target[part] = current;
      else {
        const next = target[part];
        if (!next || typeof next !== "object" || Array.isArray(next)) target[part] = {};
        target = target[part] as JsonRecord;
      }
    }
  }
  return output;
}

function reference(uuid: string, documentType: string, data: JsonRecord, parentUuid?: string, packId?: string): JsonRecord {
  return documentReferenceFromData(uuid, documentType, data, {
    ...(parentUuid ? { parentUuid } : {}),
    ...(packId ? { packId } : {})
  });
}

function resultDocuments(response: JsonRecord): JsonRecord[] {
  return Array.isArray(response["result"]) ? response["result"] as JsonRecord[] : [];
}

function documentTypeForPack(world: JsonRecord, packId: string): string {
  const packs = Array.isArray(world["packs"]) ? world["packs"] as JsonRecord[] : [];
  const pack = packs.find((entry) => entry["id"] === packId || entry["collection"] === packId || entry["pack"] === packId);
  const type = pack?.["type"] ?? pack?.["documentName"] ?? pack?.["documentType"];
  if (!pack || typeof type !== "string" || !type) {
    throw new AppError("DOCUMENT_NOT_FOUND", `Compendium ${packId} was not found`);
  }
  return type;
}

function matchesText(data: JsonRecord, query: string): boolean {
  const name = typeof data["name"] === "string" ? data["name"].toLocaleLowerCase() : "";
  return !query || name.includes(query);
}

function folderIdOf(data: JsonRecord): string | undefined {
  const folder = data["folder"];
  if (typeof folder === "string") return folder;
  if (folder && typeof folder === "object" && !Array.isArray(folder)) {
    const id = (folder as JsonRecord)["id"] ?? (folder as JsonRecord)["_id"];
    if (typeof id === "string") return id;
  }
  return undefined;
}

function embeddedCollectionName(type: string): string {
  if (type === "ActiveEffect") return "effects";
  return `${type.charAt(0).toLowerCase()}${type.slice(1)}s`;
}

export class DirectFoundryOperations {
  constructor(private readonly getClient: () => Promise<FoundryDirectClient>) {}

  async getStatus(): Promise<JsonRecord> {
    const client = await this.getClient();
    const world = await client.requestWorldData();
    const worldMeta = asRecord(world["world"] ?? {}, "world");
    const system = asRecord(world["system"] ?? {}, "system");
    return {
      connected: true,
      backend: "direct",
      world: {
        id: worldMeta["id"],
        title: worldMeta["title"]
      },
      system: {
        id: system["id"],
        version: system["version"]
      },
      modules: Array.isArray(world["modules"]) ? world["modules"] : []
    };
  }

  async searchDocuments(payload: unknown): Promise<JsonRecord> {
    const input = asRecord(payload);
    const documentType = asString(input["documentType"], "documentType");
    const query = typeof input["query"] === "string" ? input["query"].trim().toLocaleLowerCase() : "";
    const folderId = typeof input["folderId"] === "string" ? input["folderId"] : undefined;
    const packId = typeof input["packId"] === "string" ? input["packId"] : undefined;
    const limit = Math.max(1, Math.min(100, Number(input["limit"] ?? 25)));
    const offset = decodeCursor(input["cursor"]);
    const client = await this.getClient();

    let entries: { uuid: string; data: JsonRecord }[];
    if (packId) {
      const response = await client.getDocuments(documentType, { pack: packId, query: {} }, { logLabel: `search pack ${packId}` });
      entries = resultDocuments(response).map((data) => ({
        uuid: compendiumUuid(packId, asString(data["_id"], "_id")),
        data
      }));
    } else {
      const response = await client.getDocuments(documentType, { query: {} }, { logLabel: `search ${documentType}` });
      entries = resultDocuments(response).map((data) => ({
        uuid: worldUuid(documentType, asString(data["_id"], "_id")),
        data
      }));
    }

    const filtered = entries.filter(({ data }) =>
      matchesText(data, query) && (!folderId || folderIdOf(data) === folderId)
    );
    const page = filtered.slice(offset, offset + limit);
    return {
      results: page.map(({ uuid, data }) => reference(uuid, documentType, data, undefined, packId)),
      ...(offset + limit < filtered.length ? { nextCursor: encodeCursor(offset + limit) } : {}),
      total: filtered.length
    };
  }

  async getDocument(payload: unknown): Promise<JsonRecord> {
    const input = asRecord(payload);
    const uuid = asString(input["uuid"], "uuid");
    const paths = Array.isArray(input["paths"]) ? input["paths"].filter((x): x is string => typeof x === "string") : undefined;
    const includeEmbedded = input["includeEmbedded"] === true;
    const found = await this.readDocumentByUuid(uuid);
    const data = { ...found.data };
    if (!includeEmbedded) {
      delete data["items"];
      delete data["effects"];
    }
    return {
      document: reference(uuid, found.documentType, data, found.parentUuid, found.packId),
      data: pickPaths(data, paths)
    };
  }

  async createDocuments(payload: unknown, operationId: string): Promise<JsonRecord> {
    const input = asRecord(payload);
    const documentType = asString(input["documentType"], "documentType");
    const rawDocuments = asArray(input["documents"], "documents").map((entry, index) => {
      const data = asRecord(entry, `documents[${index}]`);
      return typeof input["folderId"] === "string" ? { ...data, folder: input["folderId"] } : data;
    });
    const client = await this.getClient();
    const response = await client.createDocuments(documentType, rawDocuments);
    return {
      ...emptyReceipt(operationId),
      created: resultDocuments(response).map((data) =>
        reference(worldUuid(documentType, asString(data["_id"], "_id")), documentType, data)
      )
    };
  }

  async updateDocuments(payload: unknown, operationId: string): Promise<JsonRecord> {
    const input = asRecord(payload);
    const updates = asArray(input["updates"], "updates").map((entry, index) => asRecord(entry, `updates[${index}]`));
    const grouped = new Map<string, { changes: JsonRecord; parsed: ReturnType<typeof parseFoundryUuid> }[]>();
    for (const update of updates) {
      const uuid = asString(update["uuid"], "uuid");
      const parsed = parseFoundryUuid(uuid);
      if (parsed.kind !== "world") throw new AppError("INVALID_REQUEST", `Use embedded or compendium-aware update for ${uuid}`);
      const changes = asRecord(update["changes"], "changes");
      const list = grouped.get(parsed.documentType) ?? [];
      list.push({ changes, parsed });
      grouped.set(parsed.documentType, list);
    }
    const client = await this.getClient();
    const updatedRefs: JsonRecord[] = [];
    for (const [documentType, entries] of grouped) {
      const response = await client.updateDocuments(documentType, entries.map(({ changes, parsed }) => ({
        _id: parsed.kind === "world" ? parsed.id : "",
        ...changes
      })));
      updatedRefs.push(...resultDocuments(response).map((data) =>
        reference(worldUuid(documentType, asString(data["_id"], "_id")), documentType, data)
      ));
    }
    return { ...emptyReceipt(operationId), updated: updatedRefs };
  }

  async createEmbedded(payload: unknown, operationId: string): Promise<JsonRecord> {
    const input = asRecord(payload);
    const parentUuid = asString(input["parentUuid"], "parentUuid");
    const embeddedType = asString(input["embeddedType"], "embeddedType");
    const documents = asArray(input["documents"], "documents").map((entry, index) => asRecord(entry, `documents[${index}]`));
    const client = await this.getClient();
    const response = await client.createDocuments(embeddedType, documents, { parentUuid });
    return {
      ...emptyReceipt(operationId),
      created: resultDocuments(response).map((data) =>
        reference(embeddedUuid(parentUuid, embeddedType, asString(data["_id"], "_id")), embeddedType, data, parentUuid)
      )
    };
  }

  async updateEmbedded(payload: unknown, operationId: string): Promise<JsonRecord> {
    const input = asRecord(payload);
    const parentUuid = asString(input["parentUuid"], "parentUuid");
    const embeddedType = asString(input["embeddedType"], "embeddedType");
    const updates = asArray(input["updates"], "updates").map((entry, index) => asRecord(entry, `updates[${index}]`));
    const changes = updates.map((update) => {
      const uuid = asString(update["uuid"], "uuid");
      const parsed = parseFoundryUuid(uuid);
      if (parsed.kind !== "embedded" || parsed.parentUuid !== parentUuid || parsed.documentType !== embeddedType) {
        throw new AppError("DOCUMENT_NOT_FOUND", `Embedded document ${uuid} was not found on ${parentUuid}`);
      }
      return { _id: parsed.id, ...asRecord(update["changes"], "changes") };
    });
    const client = await this.getClient();
    const response = await client.updateDocuments(embeddedType, changes, { parentUuid });
    return {
      ...emptyReceipt(operationId),
      updated: resultDocuments(response).map((data) =>
        reference(embeddedUuid(parentUuid, embeddedType, asString(data["_id"], "_id")), embeddedType, data, parentUuid)
      )
    };
  }

  async prepareDelete(payload: unknown): Promise<JsonRecord> {
    const input = asRecord(payload);
    const uuids = asArray(input["uuids"], "uuids").map((entry) => asString(entry, "uuid"));
    const targets: JsonRecord[] = [];
    const consequences: string[] = [];
    for (const uuid of uuids) {
      const found = await this.readDocumentByUuid(uuid);
      targets.push(reference(uuid, found.documentType, found.data, found.parentUuid, found.packId));
      const name = typeof found.data["name"] === "string" ? found.data["name"] : uuid;
      if (found.documentType === "Actor") consequences.push(`Actor ${name} and its embedded documents will be deleted.`);
      else if (found.documentType === "Scene") consequences.push(`Scene ${name} and its embedded placeables will be deleted.`);
      else if (found.parentUuid) consequences.push(`${found.documentType} ${name} will be removed from its parent.`);
    }
    return { targets, consequences };
  }

  async deleteDocuments(payload: unknown, operationId: string): Promise<JsonRecord> {
    const input = asRecord(payload);
    if (input["confirmed"] !== true) throw new AppError("DELETE_CONFIRMATION_INVALID", "A server-validated confirmation is required");
    const uuids = asArray(input["uuids"], "uuids").map((entry) => asString(entry, "uuid"));
    const refs: JsonRecord[] = [];
    const client = await this.getClient();
    const groups = new Map<string, { ids: string[]; parentUuid?: string; pack?: string; refs: JsonRecord[] }>();
    for (const uuid of uuids) {
      const found = await this.readDocumentByUuid(uuid);
      const parsed = parseFoundryUuid(uuid);
      const ref = reference(uuid, found.documentType, found.data, found.parentUuid, found.packId);
      refs.push(ref);
      const key = parsed.kind === "embedded"
        ? `${parsed.documentType}|${parsed.parentUuid}`
        : parsed.kind === "compendium"
          ? `${found.documentType}|pack:${parsed.packId}`
          : `${parsed.documentType}|`;
      const group = groups.get(key) ?? { ids: [], ...(parsed.kind === "embedded" ? { parentUuid: parsed.parentUuid } : {}), ...(parsed.kind === "compendium" ? { pack: parsed.packId } : {}), refs: [] };
      group.ids.push(parsed.id);
      group.refs.push(ref);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const documentType = key.split("|")[0] ?? "";
      await client.deleteDocuments(documentType, group.ids, {
        ...(group.parentUuid ? { parentUuid: group.parentUuid } : {}),
        ...(group.pack ? { pack: group.pack } : {})
      });
    }
    return { ...emptyReceipt(operationId), deleted: refs };
  }

  async searchCompendiums(payload: unknown): Promise<JsonRecord> {
    const input = asRecord(payload);
    const query = typeof input["query"] === "string" ? input["query"].trim().toLocaleLowerCase() : "";
    const requestedPackId = typeof input["packId"] === "string" ? input["packId"] : undefined;
    const requestedDocumentType = typeof input["documentType"] === "string" ? input["documentType"] : undefined;
    const limit = Math.max(1, Math.min(100, Number(input["limit"] ?? 25)));
    const offset = decodeCursor(input["cursor"]);
    const client = await this.getClient();
    const world = await client.requestWorldData();
    const packs = (Array.isArray(world["packs"]) ? world["packs"] as JsonRecord[] : []).filter((pack) => {
      const packId = typeof pack["id"] === "string" ? pack["id"] : typeof pack["collection"] === "string" ? pack["collection"] : "";
      const type = pack["type"] ?? pack["documentName"] ?? pack["documentType"];
      return (!requestedPackId || packId === requestedPackId) && (!requestedDocumentType || type === requestedDocumentType);
    });
    const results: JsonRecord[] = [];
    for (const pack of packs) {
      const packId = asString(pack["id"] ?? pack["collection"], "packId");
      const documentType = documentTypeForPack(world, packId);
      const response = await client.getDocuments(documentType, { pack: packId, query: {} }, { logLabel: `search compendium ${packId}` });
      for (const data of resultDocuments(response)) {
        if (!matchesText(data, query)) continue;
        const id = asString(data["_id"], "_id");
        results.push(reference(compendiumUuid(packId, id), documentType, data, undefined, packId));
      }
    }
    return {
      results: results.slice(offset, offset + limit),
      ...(offset + limit < results.length ? { nextCursor: encodeCursor(offset + limit) } : {}),
      total: results.length
    };
  }

  async importCompendium(payload: unknown, operationId: string): Promise<JsonRecord> {
    const input = asRecord(payload);
    const packId = asString(input["packId"], "packId");
    const documentId = asString(input["documentId"], "documentId");
    const sourceUuid = compendiumUuid(packId, documentId);
    const source = await this.readDocumentByUuid(sourceUuid);
    const data = { ...source.data };
    delete data["_id"];
    const destination = asRecord(input["destination"] ?? { type: "world" }, "destination");
    const client = await this.getClient();
    if (destination["type"] === "actor") {
      if (source.documentType !== "Item") throw new AppError("INVALID_REQUEST", "Only Items can be imported into an Actor");
      const actorUuid = asString(destination["actorUuid"], "destination.actorUuid");
      const response = await client.createDocuments("Item", [data], { parentUuid: actorUuid });
      return {
        ...emptyReceipt(operationId),
        created: resultDocuments(response).map((created) =>
          reference(embeddedUuid(actorUuid, "Item", asString(created["_id"], "_id")), "Item", created, actorUuid)
        )
      };
    }
    if (destination["type"] !== "world") throw new AppError("INVALID_REQUEST", `Unsupported destination ${String(destination["type"])}`);
    if (typeof destination["folderId"] === "string") data["folder"] = destination["folderId"];
    const response = await client.createDocuments(source.documentType, [data]);
    return {
      ...emptyReceipt(operationId),
      created: resultDocuments(response).map((created) =>
        reference(worldUuid(source.documentType, asString(created["_id"], "_id")), source.documentType, created)
      )
    };
  }

  private async readDocumentByUuid(uuid: string): Promise<{ data: JsonRecord; documentType: string; parentUuid?: string; packId?: string }> {
    const parsed = parseFoundryUuid(uuid);
    const client = await this.getClient();
    if (parsed.kind === "compendium") {
      const world = await client.requestWorldData();
      const documentType = documentTypeForPack(world, parsed.packId);
      const response = await client.getDocuments(documentType, { pack: parsed.packId, query: { _id: parsed.id } }, { logLabel: `get ${uuid}` });
      const data = resultDocuments(response)[0];
      if (!data) throw new AppError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found`);
      return { data, documentType, packId: parsed.packId };
    }
    if (parsed.kind === "world") {
      const response = await client.getDocuments(parsed.documentType, { query: { _id: parsed.id } }, { logLabel: `get ${uuid}` });
      const data = resultDocuments(response)[0];
      if (!data) throw new AppError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found`);
      return { data, documentType: parsed.documentType };
    }

    try {
      const response = await client.getDocuments(parsed.documentType, {
        parentUuid: parsed.parentUuid,
        query: { _id: parsed.id }
      }, { logLabel: `get ${uuid}` });
      const direct = resultDocuments(response)[0];
      if (direct) return { data: direct, documentType: parsed.documentType, parentUuid: parsed.parentUuid };
    } catch {
      // Some Foundry versions do not accept direct embedded get operations; use the parent fallback below.
    }
    const parent = await this.readDocumentByUuid(parsed.parentUuid);
    const collection = embeddedCollectionName(parsed.documentType);
    const embedded = Array.isArray(parent.data[collection]) ? parent.data[collection] as JsonRecord[] : [];
    const data = embedded.find((entry) => entry["_id"] === parsed.id);
    if (!data) throw new AppError("DOCUMENT_NOT_FOUND", `Embedded document ${uuid} was not found`);
    return { data, documentType: parsed.documentType, parentUuid: parsed.parentUuid };
  }
}
