import { emptyReceipt, toDocumentReference } from "./document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "./errors";
import { assertSafeObject } from "./safe-data";

export async function createDocuments(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  const documentType = requireString(input.documentType, "documentType");
  if (!Array.isArray(input.documents) || input.documents.length === 0 || input.documents.length > 50) {
    throw new OperationError("INVALID_REQUEST", "documents must contain between 1 and 50 entries.");
  }
  const rawDocuments = input.documents as unknown[];
  const documents = rawDocuments.map((entry, index) => {
    assertSafeObject(entry, `documents[${index}]`);
    return typeof input.folderId === "string" ? { ...entry, folder: input.folderId } : entry;
  });
  const constructor = getPublicDocumentClass(documentType);
  const created = await constructor.createDocuments(documents, { renderSheet: false });
  return { ...emptyReceipt(operationId), created: created.map(toDocumentReference) };
}

export function getPublicDocumentClass(documentType: string): FoundryDocumentConstructor {
  try {
    const constructor = getDocumentClass(documentType);
    if (!constructor?.createDocuments) throw new Error("missing constructor");
    return constructor;
  } catch {
    const constructor = CONFIG[documentType]?.documentClass;
    if (!constructor) throw new OperationError("INVALID_REQUEST", `Unsupported document type ${documentType}.`);
    return constructor;
  }
}
