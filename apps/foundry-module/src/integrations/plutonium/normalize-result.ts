import { emptyReceipt, toDocumentReference } from "../../operations/document-reference";

export function normalizePlutoniumResult(
  operationId: string,
  result: unknown,
  eventDocuments: FoundryDocument[],
  providerVersion?: string,
) {
  const summaries = Array.isArray(result) ? result : [result];
  const outcomes = summaries.map(getSummaryOutcome);
  const created: FoundryDocument[] = [];
  const updated: FoundryDocument[] = [];
  const skippedDocuments: FoundryDocument[] = [];

  summaries.forEach((summary, index) => {
    const documents: FoundryDocument[] = [];
    collectDocuments(summary, documents, new WeakSet<object>());
    if (outcomes[index] === "failed") return;
    const target = outcomes[index] === "skipped"
      ? skippedDocuments
      : outcomes[index] === "updated"
        ? updated
        : created;
    appendUnique(target, documents);
  });

  if (!created.length && !updated.length && !skippedDocuments.length && outcomes.every((outcome) => outcome === "completed")) {
    appendUnique(created, eventDocuments);
  }

  const failedCount = outcomes.filter((outcome) => outcome === "failed").length;
  const skippedCount = outcomes.filter((outcome) => outcome === "skipped").length;
  const successfulCount = outcomes.length - failedCount - skippedCount;
  const failed = outcomes.length > 0 && failedCount === outcomes.length;
  const skipped = outcomes.length > 0 && skippedCount === outcomes.length;
  const outcomeKinds = new Set([
    failedCount > 0 ? "failed" : "",
    skippedCount > 0 ? "skipped" : "",
    successfulCount > 0 ? "successful" : "",
  ].filter(Boolean));
  const mixed = outcomeKinds.size > 1;
  const receipt = {
    ...emptyReceipt(operationId, "plutonium"),
    ...(providerVersion ? { providerVersion } : {}),
    status: failed ? "failed" as const : skipped ? "skipped" as const : mixed ? "partial" as const : "completed" as const,
  };
  return {
    ...receipt,
    created: created.map(toDocumentReference),
    updated: updated.map(toDocumentReference),
    skipped: skippedDocuments.map(toDocumentReference),
  };
}

function statusDescription(status: unknown): string {
  if (typeof status === "string") return status;
  if (typeof status === "symbol") return status.description ?? String(status);
  return "";
}

function getSummaryOutcome(value: unknown): "completed" | "updated" | "skipped" | "failed" {
  if (!value || typeof value !== "object") return "completed";
  const status = statusDescription((value as Record<string, unknown>).status).toLocaleLowerCase();
  if (/fail|error/.test(status)) return "failed";
  if (/skip|cancel/.test(status)) return "skipped";
  if (/overwrite|update/.test(status)) return "updated";
  return "completed";
}

function appendUnique(target: FoundryDocument[], documents: FoundryDocument[]): void {
  documents.forEach((document) => {
    if (!target.some((existing) => existing.uuid === document.uuid)) target.push(document);
  });
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
  else Object.entries(value)
    .filter(([key]) => key !== "actor" && key !== "destination" && key !== "options" && key !== "importOpts")
    .forEach(([, entry]) => collectDocuments(entry, output, seen));
}
