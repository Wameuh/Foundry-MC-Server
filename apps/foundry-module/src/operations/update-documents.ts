import { emptyReceipt, toDocumentReference } from "./document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "./errors";
import { assertSafeObject } from "./safe-data";

export async function updateDocuments(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  if (!Array.isArray(input.updates) || input.updates.length === 0 || input.updates.length > 50) {
    throw new OperationError("INVALID_REQUEST", "updates must contain between 1 and 50 entries.");
  }
  const updated: FoundryDocument[] = [];
  const rawUpdates = input.updates as unknown[];
  for (const [index, raw] of rawUpdates.entries()) {
    const entry = requireRecord(raw, `updates[${index}]`);
    const uuid = requireString(entry.uuid, `updates[${index}].uuid`);
    assertSafeObject(entry.changes, `updates[${index}].changes`);
    const document = await fromUuid(uuid);
    if (!document) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found.`);
    updated.push(await document.update(entry.changes, { diff: true, recursive: true }));
  }
  return { ...emptyReceipt(operationId), updated: updated.map(toDocumentReference) };
}
