import { toDocumentReference } from "./document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "./errors";

export async function prepareDelete(payload: unknown) {
  requireGm();
  const input = requireRecord(payload);
  if (!Array.isArray(input.uuids) || input.uuids.length === 0 || input.uuids.length > 50) {
    throw new OperationError("INVALID_REQUEST", "uuids must contain between 1 and 50 entries.");
  }
  const targets = [];
  const consequences: string[] = [];
  const rawUuids = input.uuids as unknown[];
  for (const rawUuid of rawUuids) {
    const uuid = requireString(rawUuid, "uuid");
    const document = await fromUuid(uuid);
    if (!document) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found.`);
    targets.push(toDocumentReference(document));
    if (document.documentName === "Actor") consequences.push(`Actor ${document.name ?? document.id} and its embedded documents will be deleted.`);
    else if (document.documentName === "Scene") consequences.push(`Scene ${document.name ?? document.id} and its embedded placeables will be deleted.`);
    else if (document.parent) consequences.push(`${document.documentName} ${document.name ?? document.id} will be removed from ${document.parent.name ?? document.parent.id}.`);
  }
  return { targets, consequences };
}
