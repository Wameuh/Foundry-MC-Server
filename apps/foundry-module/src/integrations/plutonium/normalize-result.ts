import { emptyReceipt, toDocumentReference } from "../../operations/document-reference";

export function normalizePlutoniumResult(
  operationId: string,
  result: unknown,
  eventDocuments: FoundryDocument[],
  providerVersion?: string,
) {
  const documents: FoundryDocument[] = [];
  collectDocuments(result, documents, new WeakSet<object>());
  if (!documents.length) documents.push(...eventDocuments);
  const rawStatus = (result as { status?: unknown } | undefined)?.status;
  const statusValue = typeof rawStatus === "string" ? rawStatus.toLocaleLowerCase() : "";
  const failed = /fail|error/.test(statusValue);
  const skipped = /skip|cancel|duplicate/.test(statusValue);
  const receipt = {
    ...emptyReceipt(operationId, "plutonium"),
    ...(providerVersion ? { providerVersion } : {}),
    status: failed ? ("failed" as const) : skipped ? ("skipped" as const) : ("completed" as const),
  };
  if (skipped) return { ...receipt, skipped: documents.map(toDocumentReference) };
  return { ...receipt, created: documents.map(toDocumentReference) };
}

function collectDocuments(value: unknown, output: FoundryDocument[], seen: WeakSet<object>): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  const candidate = value as Partial<FoundryDocument>;
  if (typeof candidate.uuid === "string" && typeof candidate.documentName === "string" && typeof candidate.toObject === "function") {
    if (!output.some((document) => document.uuid === candidate.uuid)) output.push(value as FoundryDocument);
    return;
  }
  if (Array.isArray(value)) value.forEach((entry) => collectDocuments(entry, output, seen));
  else Object.values(value).forEach((entry) => collectDocuments(entry, output, seen));
}
