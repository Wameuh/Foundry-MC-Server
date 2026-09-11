import { emptyReceipt, toDocumentReference } from "./document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "./errors";
import { assertSafeObject } from "./safe-data";

export async function createEmbeddedDocuments(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  const parent = await requireParent(input.parentUuid);
  const documentType = requireString(input.embeddedType, "embeddedType");
  if (!Array.isArray(input.documents) || input.documents.length === 0 || input.documents.length > 50) {
    throw new OperationError("INVALID_REQUEST", "documents must contain between 1 and 50 entries.");
  }
  const rawDocuments = input.documents as unknown[];
  const documents = rawDocuments.map((entry, index) => {
    assertSafeObject(entry, `documents[${index}]`);
    return entry;
  });
  const created = await parent.createEmbeddedDocuments(documentType, documents, { renderSheet: false });
  return { ...emptyReceipt(operationId), created: created.map(toDocumentReference) };
}

export async function updateEmbeddedDocuments(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  const parent = await requireParent(input.parentUuid);
  const documentType = requireString(input.embeddedType, "embeddedType");
  if (!Array.isArray(input.updates) || input.updates.length === 0 || input.updates.length > 50) {
    throw new OperationError("INVALID_REQUEST", "updates must contain between 1 and 50 entries.");
  }
  const updates: Record<string, unknown>[] = [];
  const rawUpdates = input.updates as unknown[];
  for (const [index, raw] of rawUpdates.entries()) {
    const entry = requireRecord(raw, `updates[${index}]`);
    const uuid = requireString(entry.uuid, `updates[${index}].uuid`);
    const embedded = await fromUuid(uuid);
    if (!embedded || embedded.parent?.uuid !== parent.uuid || embedded.documentName !== documentType) {
      throw new OperationError("DOCUMENT_NOT_FOUND", `Embedded document ${uuid} was not found on ${parent.uuid}.`);
    }
    assertSafeObject(entry.changes, `updates[${index}].changes`);
    updates.push({ _id: embedded.id, ...entry.changes });
  }
  const updated = await parent.updateEmbeddedDocuments(documentType, updates, { diff: true, recursive: true });
  return { ...emptyReceipt(operationId), updated: updated.map(toDocumentReference) };
}

async function requireParent(value: unknown): Promise<FoundryDocument> {
  const uuid = requireString(value, "parentUuid");
  const parent = await fromUuid(uuid);
  if (!parent) throw new OperationError("DOCUMENT_NOT_FOUND", `Parent ${uuid} was not found.`);
  return parent;
}
