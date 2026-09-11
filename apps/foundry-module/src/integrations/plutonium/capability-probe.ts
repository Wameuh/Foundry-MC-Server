import { getPlutoniumCompatibility } from "./compatibility";
import { getPlutoniumApi, getPlutoniumModule } from "./detect";
import { PLUTONIUM_IMPORTERS } from "./importer-registry";
import type { PlutoniumApi, PlutoniumCapabilities, PlutoniumImporter } from "./types";

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
let probedImporters = new Map<string, PlutoniumImporter>();

export function getPlutoniumCapabilities(): PlutoniumCapabilities {
  return { ...capabilities, importers: [...capabilities.importers], destinations: [...capabilities.destinations] };
}

export function getProbedPlutoniumImporter(api: PlutoniumApi, prop: string): PlutoniumImporter | undefined {
  return api === probedApi ? probedImporters.get(prop) : undefined;
}

export async function refreshPlutoniumCapabilities(): Promise<PlutoniumCapabilities> {
  const currentApi = getPlutoniumApi();
  if (currentApi && currentApi === probedApi && capabilities.compatible) {
    return getPlutoniumCapabilities();
  }
  if (refreshInFlight) return await refreshInFlight;
  const refresh = probePlutoniumCapabilities();
  refreshInFlight = refresh;
  try {
    return await refresh;
  } finally {
    if (refreshInFlight === refresh) refreshInFlight = undefined;
  }
}

async function probePlutoniumCapabilities(): Promise<PlutoniumCapabilities> {
  const base = createBaseCapabilities();
  const api = getPlutoniumApi();
  if (!base.compatible || !api) {
    probedApi = undefined;
    probedImporters = new Map();
    capabilities = api ? base : { ...base, compatible: false, reason: base.reason ?? "The expected public API is unavailable." };
    return getPlutoniumCapabilities();
  }
  const importers: string[] = [];
  const importerInstances = new Map<string, PlutoniumImporter>();
  for (const prop of PLUTONIUM_IMPORTERS) {
    try {
      const importer = await api.importer.pGetImporter({ prop });
      if (importer && typeof importer.pImportEntry === "function") {
        importers.push(prop);
        importerInstances.set(prop, importer);
      }
    } catch {
      // Unsupported importers are capabilities, not fatal startup errors.
    }
  }
  capabilities = {
    ...base,
    importJson: importers.length > 0,
    importReference: true,
    importers,
    destinations: ["world", "actor", "pack"],
  };
  probedApi = api;
  probedImporters = importerInstances;
  return getPlutoniumCapabilities();
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
