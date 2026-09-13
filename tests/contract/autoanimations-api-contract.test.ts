import { describe, expect, it } from "vitest";

import { isAutomatedAnimationsApi, getSequencerDatabase } from "../../apps/foundry-module/src/integrations/autoanimations/detect.js";
import { createFakeAutomatedAnimations } from "../helpers/fake-autoanimations.js";

describe("Automated Animations public API contract", () => {
  it("recognizes the supported public surface for certified versions", () => {
    expect(isAutomatedAnimationsApi(createFakeAutomatedAnimations().api)).toBe(true);
  });

  it("fails closed when an expected API member is missing", () => {
    const { api } = createFakeAutomatedAnimations();
    expect(
      isAutomatedAnimationsApi({
        ...api,
        AutorecManager: { getAutorecEntries: undefined as unknown as () => Record<string, unknown> },
      }),
    ).toBe(false);
    expect(isAutomatedAnimationsApi({ ...api, playAnimation: undefined })).toBe(false);
  });

  it("only exposes Sequencer catalog access when getPathsUnder is a function", () => {
    (globalThis as Record<string, unknown>).Sequencer = {
      Database: { getPathsUnder: true },
    };
    expect(getSequencerDatabase()).toBeUndefined();

    (globalThis as Record<string, unknown>).Sequencer = {
      Database: {
        getPathsUnder: (path: string) => [`${path}.spell.firebolt.01.orange`],
      },
    };
    expect(typeof getSequencerDatabase()?.getPathsUnder).toBe("function");

    delete (globalThis as Record<string, unknown>).Sequencer;
  });
});
