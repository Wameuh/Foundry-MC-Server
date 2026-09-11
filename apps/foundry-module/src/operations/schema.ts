import { OperationError } from "./errors";

const DOCUMENT_TYPES = ["Actor", "Item", "ActiveEffect", "JournalEntry", "Macro", "Playlist", "RollTable", "Scene"];

export function getSchema(payload: unknown) {
  const documentType = (payload as { documentType?: unknown } | undefined)?.documentType;
  if (documentType !== undefined && (typeof documentType !== "string" || !DOCUMENT_TYPES.includes(documentType))) {
    throw new OperationError("INVALID_REQUEST", "Unsupported document type.");
  }
  return {
    system: { id: game.system.id, version: game.system.version },
    documentTypes: documentType ? [documentType] : DOCUMENT_TYPES,
    immutablePaths: ["_id", "uuid", "parent", "pack", "apps", "collection"],
    note: "Use source data accepted by the active Foundry DataModel. The bridge validates through public Document APIs.",
  };
}
