import { SUPPORTED_AUTOANIMATIONS_VERSIONS } from "@foundry-mcp/protocol/constants";
import { getAutoAnimationsModule } from "./detect";

export { SUPPORTED_AUTOANIMATIONS_VERSIONS };

export function getAutoAnimationsCompatibility(): {
  compatible: boolean;
  version?: string;
  reason?: string;
} {
  const module = getAutoAnimationsModule();
  if (!module) return { compatible: false, reason: "Automated Animations is not installed." };
  if (!module.active) {
    return {
      compatible: false,
      ...(module.version ? { version: module.version } : {}),
      reason: "Automated Animations is inactive.",
    };
  }
  if (
    !module.version ||
    !SUPPORTED_AUTOANIMATIONS_VERSIONS.includes(
      module.version as (typeof SUPPORTED_AUTOANIMATIONS_VERSIONS)[number],
    )
  ) {
    return {
      compatible: false,
      ...(module.version ? { version: module.version } : {}),
      reason: module.version
        ? `Automated Animations ${module.version} is unsupported. Certified versions: ${SUPPORTED_AUTOANIMATIONS_VERSIONS.join(", ")}.`
        : `Automated Animations version is unavailable. Certified versions: ${SUPPORTED_AUTOANIMATIONS_VERSIONS.join(", ")}.`,
    };
  }
  return { compatible: true, ...(module.version ? { version: module.version } : {}) };
}
