import { SUPPORTED_PLUTONIUM_VERSIONS } from "@foundry-mcp/protocol/constants";
import type { PlutoniumApi } from "./types";

export { SUPPORTED_PLUTONIUM_VERSIONS };

/** Kept for consumers that used the original single-version export. */
export const SUPPORTED_PLUTONIUM_VERSION = SUPPORTED_PLUTONIUM_VERSIONS[0];

export function getPlutoniumModule() {
  return game.modules?.get("plutonium");
}

export function getPlutoniumApi(): PlutoniumApi | undefined {
  const module = getPlutoniumModule();
  if (!module?.active || !isPlutoniumApi(module.api)) return undefined;
  return module.api;
}

export function isPlutoniumApi(value: unknown): value is PlutoniumApi {
  if (!value || typeof value !== "object") return false;
  const api = value as Partial<PlutoniumApi>;
  return Boolean(
    api.importer &&
      typeof api.importer.pGetImporter === "function" &&
      typeof api.importer.ImportOpts === "function" &&
      api.util?.uuidFauxCompendium &&
      typeof api.util.uuidFauxCompendium.getCustomUuid === "function" &&
      api.hooks &&
      typeof api.hooks.on === "function",
  );
}
