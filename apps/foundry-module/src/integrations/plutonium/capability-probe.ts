import { getPlutoniumCompatibility } from "./compatibility";
import { getPlutoniumApi, getPlutoniumModule } from "./detect";
import { PLUTONIUM_IMPORTERS } from "./importer-registry";
import type { PlutoniumApi, PlutoniumCapabilities } from "./types";

// Module bundles are evaluated before Foundry has populated game.modules.
// Keep startup side-effect free and probe Plutonium only from the ready hook.
let capabilities: PlutoniumCapabilities = {
  active: false,
  compatible: false,
  importJson: false,
  importReference: false,
  importers: [],
  destinations: [],
  reason: "Plutonium capabilities have not been probed yet.",
};
let refreshInFlight: Promise<PlutoniumCapabilities> | undefined;
let probedApi: PlutoniumApi | undefined;

export function getPlutoniumCapabilities(): PlutoniumCapabilities {
  return { ...capabilities, importers: [...capabilities.importers], destinations: [...capabilities.destinations] };
}

export async function refreshPlutoniumCapabilities(): Promise<PlutoniumCapabilities> {
  const currentApi = getPlutoniumApi();
  if (currentApi && currentApi === probedApi && capabilities.compatible) {
    return getPlutoniumCapabilities();
  }
  if (refreshInFlight) return await refreshInFlight;
  const refresh = Promise.resolve(probePlutoniumCapabilities());
  refreshInFlight = refresh;
  try {
    return await refresh;
  } finally {
    if (refreshInFlight === refresh) refreshInFlight = undefined;
  }
}

function probePlutoniumCapabilities(): PlutoniumCapabilities {
  const base = createBaseCapabilities();
  const api = getPlutoniumApi();
  if (!base.compatible || !api) {
    probedApi = undefined;
    capabilities = api ? base : { ...base, compatible: false, reason: base.reason ?? "The expected public API is unavailable." };
    return getPlutoniumCapabilities();
  }
  // pGetImporter calls pInit and may load substantial data. Do not eagerly
  // initialize every importer during capability discovery; importers are
  // resolved lazily by the operation which needs them.
  const importers = [...PLUTONIUM_IMPORTERS];
  capabilities = {
    ...base,
    importJson: true,
    importReference: isFauxUuidPatchEnabled(api),
    importers,
    destinations: ["world", "actor", "pack"],
  };
  probedApi = api;
  return getPlutoniumCapabilities();
}

function isFauxUuidPatchEnabled(api: PlutoniumApi): boolean {
  try {
    return api.config?.getValue("misc", "isPatchFromUuid") === true;
  } catch {
    return false;
  }
}

function createBaseCapabilities(): PlutoniumCapabilities {
  const module = getPlutoniumModule();
  const compatibility = getPlutoniumCompatibility();
  return {
    active: Boolean(module?.active),
    ...(module?.version ? { version: module.version } : {}),
    compatible: compatibility.compatible,
    importJson: false,
    importReference: false,
    importers: [],
    destinations: [],
    ...(compatibility.reason ? { reason: compatibility.reason } : {}),
  };
}
