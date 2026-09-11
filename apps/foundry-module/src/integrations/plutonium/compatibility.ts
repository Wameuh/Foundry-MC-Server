import { getPlutoniumModule, SUPPORTED_PLUTONIUM_VERSION } from "./detect";

export function getPlutoniumCompatibility(): { compatible: boolean; version?: string; reason?: string } {
  const module = getPlutoniumModule();
  if (!module) return { compatible: false, reason: "Plutonium is not installed." };
  if (!module.active) return {
    compatible: false,
    ...(module.version ? { version: module.version } : {}),
    reason: "Plutonium is inactive.",
  };
  if (module.version !== SUPPORTED_PLUTONIUM_VERSION) {
    return {
      compatible: false,
      ...(module.version ? { version: module.version } : {}),
      reason: `Plutonium ${String(module.version)} is not in the tested compatibility matrix.`,
    };
  }
  return { compatible: true, ...(module.version ? { version: module.version } : {}) };
}
