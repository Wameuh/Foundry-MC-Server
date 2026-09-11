import { emptyReceipt, toDocumentReference } from "./document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "./errors";
import { getPublicDocumentClass } from "./create-documents";

export async function searchCompendiums(payload: unknown) {
  const input = requireRecord(payload);
  const query = typeof input.query === "string" ? input.query.toLocaleLowerCase() : "";
  const requestedPackId = typeof input.packId === "string" ? input.packId : undefined;
  const requestedDocumentType = typeof input.documentType === "string" ? input.documentType : undefined;
  const limit = Math.max(1, Math.min(100, Number(input.limit ?? 25)));
  const offset = decodeCursor(input.cursor);
  const results: Array<{ uuid: string; documentType: string; name: string; packId: string }> = [];
  for (const pack of game.packs.values()) {
    if (requestedPackId && pack.collection !== requestedPackId) continue;
    if (requestedDocumentType && pack.documentName !== requestedDocumentType) continue;
    const index = Array.from(await pack.getIndex({ fields: ["name"] }));
    for (const entry of index) {
      const id = stringValue(entry._id) ?? stringValue(entry.id) ?? "";
      const name = stringValue(entry.name) ?? id;
      if (query && !name.toLocaleLowerCase().includes(query)) continue;
      results.push({ uuid: `Compendium.${pack.collection}.${id}`, documentType: pack.documentName, name, packId: pack.collection });
    }
  }
  return {
    results: results.slice(offset, offset + limit),
    nextCursor: offset + limit < results.length ? btoa(String(offset + limit)) : undefined,
    total: results.length,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
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

export async function importCompendium(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  const packId = requireString(input.packId, "packId");
  const documentId = requireString(input.documentId, "documentId");
  const pack = game.packs.get(packId);
  if (!pack) throw new OperationError("DOCUMENT_NOT_FOUND", `Compendium ${packId} was not found.`);
  const sourceDocument = await pack.getDocument(documentId);
  if (!sourceDocument) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${documentId} was not found in ${packId}.`);
  const destination = requireRecord(input.destination ?? { type: "world" }, "destination");
  const destinationType = requireString(destination.type, "destination.type");

  let created: FoundryDocument[];
  const source = sourceDocument.toObject(false);
  delete source._id;
  if (destinationType === "actor") {
    const actorUuid = requireString(destination.actorUuid, "destination.actorUuid");
    const actor = await fromUuid(actorUuid);
    if (!actor || actor.documentName !== "Actor") throw new OperationError("DOCUMENT_NOT_FOUND", `Actor ${actorUuid} was not found.`);
    if (sourceDocument.documentName !== "Item") {
      throw new OperationError("INVALID_REQUEST", "Only Items can be imported into an Actor.");
    }
    created = await actor.createEmbeddedDocuments("Item", [source]);
  } else if (destinationType === "world") {
    created = await getPublicDocumentClass(sourceDocument.documentName).createDocuments([source], { renderSheet: false });
  } else {
    throw new OperationError("INVALID_REQUEST", `Unsupported destination ${destinationType}.`);
  }
  return { ...emptyReceipt(operationId), created: created.map(toDocumentReference) };
}
