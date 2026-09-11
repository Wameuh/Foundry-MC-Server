import type { DocumentReference } from "@foundry-mcp/protocol";

export function toDocumentReference(document: FoundryDocument): DocumentReference {
  return {
    uuid: document.uuid,
    documentType: document.documentName,
    name: document.name ?? document.id,
    ...(document.parent ? { parentUuid: document.parent.uuid } : {}),
    ...(document.pack ? { packId: document.pack } : {}),
  };
}

export function emptyReceipt(operationId: string, provider: "foundry" | "plutonium" = "foundry") {
  return {
    operationId,
    status: "completed" as const,
    provider,
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };
}
