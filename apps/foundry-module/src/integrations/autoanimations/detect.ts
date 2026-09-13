import type { AutomatedAnimationsApi } from "./types";

export const AUTOANIMATIONS_MODULE_ID = "autoanimations";
export const AUTOANIMATIONS_FLAG_VERSION = 5;
export const AUTOANIMATIONS_MENUS = [
  "melee",
  "range",
  "ontoken",
  "templatefx",
  "aura",
  "preset",
] as const;

export function getAutoAnimationsModule() {
  return game.modules?.get(AUTOANIMATIONS_MODULE_ID);
}

export function getAutomatedAnimationsApi(): AutomatedAnimationsApi | undefined {
  const api = (globalThis as { AutomatedAnimations?: unknown }).AutomatedAnimations;
  if (!isAutomatedAnimationsApi(api)) return undefined;
  return api;
}

export function isAutomatedAnimationsApi(value: unknown): value is AutomatedAnimationsApi {
  if (!value || typeof value !== "object") return false;
  const api = value as Partial<AutomatedAnimationsApi>;
  return Boolean(
    api.AutorecManager &&
      typeof api.AutorecManager.getAutorecEntries === "function" &&
      typeof api.playAnimation === "function",
  );
}

export function getSequencerDatabase() {
  const sequencer = (globalThis as { Sequencer?: { Database?: unknown } }).Sequencer;
  if (!sequencer?.Database || typeof sequencer.Database !== "object") return undefined;
  return sequencer.Database as {
    getPathsUnder?: (path: string, softFail?: boolean) => string[] | undefined;
    getEntry?: (path: string, options?: { softFail?: boolean }) => unknown;
  };
}
