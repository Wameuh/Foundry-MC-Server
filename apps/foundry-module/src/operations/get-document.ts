import { OperationError, requireRecord, requireString } from "./errors";
import { pickPaths } from "./safe-data";
import { toDocumentReference } from "./document-reference";

export async function getDocument(payload: unknown) {
  const input = requireRecord(payload);
  const uuid = requireString(input.uuid, "uuid");
  const document = await fromUuid(uuid);
  if (!document) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found.`);
  const source = document.toObject(false);
  const paths = Array.isArray(input.paths)
    ? (input.paths as unknown[]).filter((path): path is string => typeof path === "string")
    : undefined;
  if (input.includeEmbedded !== true) {
    delete source.items;
    delete source.effects;
  }
  return {
    document: toDocumentReference(document),
    data: pickPaths(source, paths),
  };
}
