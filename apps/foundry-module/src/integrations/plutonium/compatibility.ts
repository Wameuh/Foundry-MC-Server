import { getPlutoniumModule, SUPPORTED_PLUTONIUM_VERSIONS } from "./detect";

export function getPlutoniumCompatibility(): { compatible: boolean; version?: string; reason?: string } {
  const module = getPlutoniumModule();
  if (!module) return { compatible: false, reason: "Plutonium is not installed." };
  if (!module.active) return {
    compatible: false,
    ...(module.version ? { version: module.version } : {}),
    reason: "Plutonium is inactive.",
  };
  if (!module.version || !SUPPORTED_PLUTONIUM_VERSIONS.includes(module.version as typeof SUPPORTED_PLUTONIUM_VERSIONS[number])) {
    return {
      compatible: false,
      ...(module.version ? { version: module.version } : {}),
      reason: module.version
        ? `Plutonium ${module.version} is unsupported. Certified versions: ${SUPPORTED_PLUTONIUM_VERSIONS.join(", ")}.`
        : `Plutonium version is unavailable. Certified versions: ${SUPPORTED_PLUTONIUM_VERSIONS.join(", ")}.`,
    };
  }
  return { compatible: true, ...(module.version ? { version: module.version } : {}) };
}
