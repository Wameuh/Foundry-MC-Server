import { emptyReceipt, toDocumentReference } from "./document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "./errors";

/** This is intentionally not exposed directly as an MCP tool; the server owns confirmation. */
export async function deleteDocuments(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  if (input.confirmed !== true) throw new OperationError("DELETE_CONFIRMATION_INVALID", "A server-validated confirmation is required.");
  if (!Array.isArray(input.uuids) || input.uuids.length === 0 || input.uuids.length > 50) {
    throw new OperationError("INVALID_REQUEST", "uuids must contain between 1 and 50 entries.");
  }
  const deleted: FoundryDocument[] = [];
  const rawUuids = input.uuids as unknown[];
  for (const rawUuid of rawUuids) {
    const uuid = requireString(rawUuid, "uuid");
    const document = await fromUuid(uuid);
    if (!document) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found.`);
    deleted.push(document);
  }
  const references = deleted.map(toDocumentReference);
  for (const document of deleted) await document.delete({ render: false });
  return { ...emptyReceipt(operationId), status: "completed" as const, deleted: references };
}
