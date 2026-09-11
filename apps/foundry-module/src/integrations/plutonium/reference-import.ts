import { emptyReceipt, toDocumentReference } from "../../operations/document-reference";
import { requireGm, requireRecord, requireString } from "../../operations/errors";
import { refreshPlutoniumCapabilities } from "./capability-probe";
import { getPlutoniumApi } from "./detect";
import { PlutoniumError, plutoniumUnavailable } from "./errors";

const PLUTONIUM_PROVIDER_TIMEOUT_MS = 110_000;

export async function importPlutoniumReference(payload: unknown, operationId: string) {
  requireGm();
  const capabilities = await refreshPlutoniumCapabilities();
  if (!capabilities.importReference) throw plutoniumUnavailable(capabilities);
  const input = requireRecord(payload);
  const type = requireString(input.type, "type");
  const name = requireString(input.name, "name");
  const source = requireString(input.source, "source");
  const destination = requireRecord(input.destination ?? { type: "world" }, "destination");
  if (destination.type !== "world") {
    throw new PlutoniumError("PLUTONIUM_REFERENCE_UNSUPPORTED", "Reference imports only support the world destination.");
  }
  const api = getPlutoniumApi();
  if (!api) throw plutoniumUnavailable(capabilities);
  let uuid: string;
  try {
    uuid = api.util.uuidFauxCompendium.getCustomUuid({ tag: type, text: `${name}|${source}` });
  } catch (error) {
    throw new PlutoniumError("PLUTONIUM_REFERENCE_UNSUPPORTED", "Plutonium could not build this reference.", safeError(error));
  }
  const document = await withTimeout(fromUuid(uuid), PLUTONIUM_PROVIDER_TIMEOUT_MS);
  if (!document) throw new PlutoniumError("PLUTONIUM_SOURCE_NOT_FOUND", `${name}|${source} could not be resolved by Plutonium.`);
  return {
    ...emptyReceipt(operationId, "plutonium"),
    providerVersion: capabilities.version,
    created: [toDocumentReference(document)],
  };
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
