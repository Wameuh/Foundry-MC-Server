import type { AutomatedAnimationsApi } from "../../apps/foundry-module/src/integrations/autoanimations/types.js";

export function createFakeAutomatedAnimations() {
  const api: AutomatedAnimationsApi = {
    AutorecManager: {
      getAutorecEntries: () => ({
        melee: [],
        range: [],
        ontoken: [],
        templatefx: [],
        aura: [],
        preset: [],
        aefx: [],
        version: 5,
      }),
    },
    playAnimation: async () => undefined,
  };

  return { api };
}
