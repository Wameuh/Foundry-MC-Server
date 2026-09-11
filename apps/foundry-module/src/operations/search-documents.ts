import { OperationError, requireRecord, requireString } from "./errors";
import { toDocumentReference } from "./document-reference";

export async function searchDocuments(payload: unknown) {
  const input = requireRecord(payload);
  const documentType = requireString(input.documentType, "documentType");
  const query = typeof input.query === "string" ? input.query.trim().toLocaleLowerCase() : "";
  const limit = Math.max(1, Math.min(100, Number(input.limit ?? 25)));
  const offset = decodeCursor(input.cursor);
  const folderId = typeof input.folderId === "string" ? input.folderId : undefined;
  const packId = typeof input.packId === "string" ? input.packId : undefined;

  let entries: Array<Record<string, unknown> | FoundryDocument>;
  if (packId) {
    const pack = game.packs.get(packId);
    if (!pack) throw new OperationError("DOCUMENT_NOT_FOUND", `Compendium ${packId} was not found.`);
    entries = Array.from(await pack.getIndex({ fields: ["name", "folder"] }));
  } else {
    const collection = game.collections.get(documentType);
    if (!collection) throw new OperationError("INVALID_REQUEST", `Unsupported document type ${documentType}.`);
    entries = collection.contents;
  }

  const filtered = entries.filter((entry) => {
    const rawName = "name" in entry ? entry.name : undefined;
    const name = (typeof rawName === "string" ? rawName : "").toLocaleLowerCase();
    const folder = "folder" in entry ? entry.folder : undefined;
    const entryFolderId = typeof folder === "string" ? folder : (folder as { id?: string } | undefined)?.id;
    return (!query || name.includes(query)) && (!folderId || entryFolderId === folderId);
  });
  const page = filtered.slice(offset, offset + limit);
  return {
    results: page.map((entry) => {
      if ("uuid" in entry && typeof entry.uuid === "string") return toDocumentReference(entry as FoundryDocument);
      const indexed = entry as Record<string, unknown>;
      const id = stringValue(indexed._id) ?? stringValue(indexed.id) ?? "";
      return { uuid: `Compendium.${packId}.${id}`, documentType, name: stringValue(indexed.name) ?? id, packId };
    }),
    nextCursor: offset + limit < filtered.length ? encodeCursor(offset + limit) : undefined,
    total: filtered.length,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function encodeCursor(offset: number): string {
  return btoa(String(offset));
}

function decodeCursor(cursor: unknown): number {
  if (cursor === undefined) return 0;
  if (typeof cursor !== "string") throw new OperationError("INVALID_REQUEST", "cursor must be a string.");
  try {
    const offset = Number(atob(cursor));
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("invalid");
    return offset;
  } catch {
    throw new OperationError("INVALID_REQUEST", "Invalid cursor.");
  }
}
