import type { PlutoniumApi } from "./types";

export type ImportEventCapture = {
  documents: FoundryDocument[];
  close(): void;
};

export function captureImportEvents(api: PlutoniumApi): ImportEventCapture {
  const documents: FoundryDocument[] = [];
  const listener = (...args: unknown[]) => collectDocuments(args, documents, new WeakSet<object>());
  api.hooks.on("importComplete", listener);
  return {
    documents,
    close: () => api.hooks.off?.("importComplete", listener),
  };
}

function collectDocuments(value: unknown, output: FoundryDocument[], seen: WeakSet<object>): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (isDocument(value)) {
    if (!output.some((document) => document.uuid === value.uuid)) output.push(value);
    return;
  }
  if (Array.isArray(value)) value.forEach((entry) => collectDocuments(entry, output, seen));
  else Object.values(value).forEach((entry) => collectDocuments(entry, output, seen));
}

function isDocument(value: object): value is FoundryDocument {
  const candidate = value as Partial<FoundryDocument>;
  return typeof candidate.uuid === "string" && typeof candidate.documentName === "string" && typeof candidate.toObject === "function";
}
