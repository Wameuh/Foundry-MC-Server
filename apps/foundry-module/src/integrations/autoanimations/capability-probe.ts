import {
  AUTOANIMATIONS_MENUS,
  getAutoAnimationsModule,
  getAutomatedAnimationsApi,
  getSequencerDatabase,
} from "./detect";
import type { AutoAnimationsCapabilities } from "./types";

let capabilities: AutoAnimationsCapabilities = {
  active: false,
  compatible: false,
  itemRead: false,
  itemWrite: false,
  autorecRead: false,
  catalogSearch: false,
  menus: [],
  reason: "Automated Animations capabilities have not been probed yet.",
};

export function getAutoAnimationsCapabilities(): AutoAnimationsCapabilities {
  return { ...capabilities, menus: [...capabilities.menus] };
}

export function refreshAutoAnimationsCapabilities(): AutoAnimationsCapabilities {
  const module = getAutoAnimationsModule();
  if (!module) {
    capabilities = {
      active: false,
      compatible: false,
      itemRead: false,
      itemWrite: false,
      autorecRead: false,
      catalogSearch: false,
      menus: [],
      reason: "Automated Animations is not installed.",
    };
    return getAutoAnimationsCapabilities();
  }

  if (!module.active) {
    capabilities = {
      active: false,
      ...(module.version ? { version: module.version } : {}),
      compatible: false,
      itemRead: false,
      itemWrite: false,
      autorecRead: false,
      catalogSearch: false,
      menus: [],
      reason: "Automated Animations is inactive.",
    };
    return getAutoAnimationsCapabilities();
  }

  const api = getAutomatedAnimationsApi();
  if (!api) {
    capabilities = {
      active: true,
      ...(module.version ? { version: module.version } : {}),
      compatible: false,
      itemRead: false,
      itemWrite: false,
      autorecRead: false,
      catalogSearch: false,
      menus: [],
      reason:
        "Automated Animations is active but window.AutomatedAnimations is not ready. Wait for aa.initialize, then retry.",
    };
    return getAutoAnimationsCapabilities();
  }

  const catalogSearch = Boolean(getSequencerDatabase()?.getPathsUnder);
  capabilities = {
    active: true,
    ...(module.version ? { version: module.version } : {}),
    compatible: true,
    itemRead: true,
    itemWrite: true,
    autorecRead: true,
    catalogSearch,
    menus: [...AUTOANIMATIONS_MENUS],
  };
  return getAutoAnimationsCapabilities();
}
