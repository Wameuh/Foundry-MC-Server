import { requireGm, requireRecord, requireString } from "../../operations/errors";
import { assertSafeObject } from "../../operations/safe-data";
import { getPlutoniumCapabilities } from "./capability-probe";
import { getPlutoniumApi } from "./detect";
import { PlutoniumError, plutoniumUnavailable } from "./errors";
import { captureImportEvents } from "./import-hooks";
import { createImportOptions } from "./import-options";
import { isKnownImporter } from "./importer-registry";
import { normalizePlutoniumResult } from "./normalize-result";

export async function importPlutoniumEntries(payload: unknown, operationId: string) {
  requireGm();
  const input = requireRecord(payload);
  const serializedSize = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  if (serializedSize > 2 * 1024 * 1024) throw new PlutoniumError("INVALID_REQUEST", "Plutonium payload exceeds 2 MiB.");
  if (!Array.isArray(input.entries) || input.entries.length === 0 || input.entries.length > 20) {
    throw new PlutoniumError("INVALID_REQUEST", "entries must contain between 1 and 20 entries.");
  }
  const capabilities = getPlutoniumCapabilities();
  const api = getPlutoniumApi();
  if (!capabilities.importJson || !api) {
    throw plutoniumUnavailable(capabilities);
  }
  const options = await createImportOptions(api, input.destination);
  const allDocuments: FoundryDocument[] = [];
  const summaries: unknown[] = [];
  const expectedNames = new Set<string>();
  const capture = captureImportEvents(api);
  try {
    const rawEntries = input.entries as unknown[];
    for (const [index, raw] of rawEntries.entries()) {
      const entry = requireRecord(raw, `entries[${index}]`);
      const prop = requireString(entry.prop, `entries[${index}].prop`);
      if (!isKnownImporter(prop) || !capabilities.importers.includes(prop)) {
        throw new PlutoniumError("PLUTONIUM_IMPORTER_UNAVAILABLE", `The ${prop} importer is unavailable.`);
      }
      assertSafeObject(entry.data, `entries[${index}].data`);
      const data = entry.data;
      expectedNames.add(requireString(data.name, `entries[${index}].data.name`));
      requireString(data.source, `entries[${index}].data.source`);
      if (data.__prop !== prop) throw new PlutoniumError("INVALID_REQUEST", `entries[${index}].data.__prop must equal prop.`);
      const importer = await api.importer.pGetImporter({ prop });
      if (!importer?.pImportEntry) throw new PlutoniumError("PLUTONIUM_IMPORTER_UNAVAILABLE", `The ${prop} importer is unavailable.`);
      try {
        summaries.push(await withTimeout(importer.pImportEntry(data, options), 120_000));
      } catch (error) {
        if (error instanceof PlutoniumError) throw error;
        throw new PlutoniumError("PLUTONIUM_IMPORT_FAILED", `Plutonium failed to import ${String(data.name)}.`, safeError(error));
      }
    }
  } finally {
    allDocuments.push(...capture.documents.filter((document) => document.name && expectedNames.has(document.name)));
    capture.close();
  }
  const receipt = normalizePlutoniumResult(operationId, summaries, allDocuments, capabilities.version);
  if (receipt.status === "failed") throw new PlutoniumError("PLUTONIUM_IMPORT_FAILED", "Plutonium reported a failed import.");
  return receipt;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Plutonium error";
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PlutoniumError("PLUTONIUM_IMPORT_TIMEOUT", "Plutonium import timed out.")), milliseconds);
    void promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("Unknown Plutonium rejection."));
    });
  });
}
