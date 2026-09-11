import { getPlutoniumCompatibility } from "./compatibility";
import { getPlutoniumApi, getPlutoniumModule } from "./detect";
import { PLUTONIUM_IMPORTERS } from "./importer-registry";
import type { PlutoniumCapabilities } from "./types";

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

export function getPlutoniumCapabilities(): PlutoniumCapabilities {
  return { ...capabilities, importers: [...capabilities.importers], destinations: [...capabilities.destinations] };
}

export async function refreshPlutoniumCapabilities(): Promise<PlutoniumCapabilities> {
  const base = createBaseCapabilities();
  const api = getPlutoniumApi();
  if (!base.compatible || !api) {
    capabilities = api ? base : { ...base, compatible: false, reason: base.reason ?? "The expected public API is unavailable." };
    return getPlutoniumCapabilities();
  }
  const importers: string[] = [];
  for (const prop of PLUTONIUM_IMPORTERS) {
    try {
      const importer = await api.importer.pGetImporter({ prop });
      if (importer && typeof importer.pImportEntry === "function") importers.push(prop);
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
