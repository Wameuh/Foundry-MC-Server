import { afterEach, describe, expect, it } from "vitest";

import { refreshAutoAnimationsCapabilities } from "../../apps/foundry-module/src/integrations/autoanimations/capability-probe.js";
import { isAutomatedAnimationsApi } from "../../apps/foundry-module/src/integrations/autoanimations/detect.js";
import { getItemAnimation } from "../../apps/foundry-module/src/integrations/autoanimations/get-item-animation.js";
import { setItemAnimation } from "../../apps/foundry-module/src/integrations/autoanimations/set-item-animation.js";
import { FakeFoundryDocument, installFakeFoundry } from "../helpers/fake-foundry.js";
import { createFakeAutomatedAnimations } from "../helpers/fake-autoanimations.js";

describe("Automated Animations set-item-animation feature", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).game;
    delete (globalThis as Record<string, unknown>).fromUuid;
    delete (globalThis as Record<string, unknown>).AutomatedAnimations;
    delete (globalThis as Record<string, unknown>).Sequencer;
  });

  it("writes flags.autoanimations on a Foundry Item without wiping sibling module flags", async () => {
    const fake = createFakeAutomatedAnimations();
    expect(isAutomatedAnimationsApi(fake.api)).toBe(true);

    const item = new FakeFoundryDocument("Item", "spell1", "Fire Bolt", undefined, {
      type: "spell",
      flags: {
        "some-other-module": { keep: true },
        autoanimations: { isEnabled: true, isCustomized: false },
      },
    });
    installFakeFoundry([item]);
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      modules: new Map([["autoanimations", { active: true, version: "7.0.17" }]]),
    };
    (globalThis as Record<string, unknown>).AutomatedAnimations = fake.api;
    refreshAutoAnimationsCapabilities();

    const receipt = await setItemAnimation(
      {
        uuid: item.uuid,
        menu: "range",
        primary: {
          menuType: "spell",
          animation: "firebolt",
          variant: "01",
          color: "orange",
        },
      },
      "op-aa-set-1",
    );

    expect(receipt).toMatchObject({
      provider: "autoanimations",
      status: "completed",
      providerVersion: "7.0.17",
    });

    const stored = item.toObject(false) as {
      flags: {
        autoanimations: Record<string, unknown>;
        "some-other-module": { keep: boolean };
      };
    };
    expect(stored.flags["some-other-module"]).toEqual({ keep: true });
    expect(stored.flags.autoanimations).toMatchObject({
      menu: "range",
      isEnabled: true,
      isCustomized: true,
      version: 5,
      primary: {
        video: {
          dbSection: "range",
          menuType: "spell",
          animation: "firebolt",
          variant: "01",
          color: "orange",
        },
      },
    });

    const reread = await getItemAnimation({ uuid: item.uuid });
    expect(reread.flags).toMatchObject({
      menu: "range",
      isCustomized: true,
      primary: { video: { animation: "firebolt", color: "orange" } },
    });
  });

  it("rejects non-GM callers before updating", async () => {
    const fake = createFakeAutomatedAnimations();
    const item = new FakeFoundryDocument("Item", "spell2", "Fire Bolt");
    installFakeFoundry([item]);
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: false },
      modules: new Map([["autoanimations", { active: true, version: "7.0.17" }]]),
    };
    (globalThis as Record<string, unknown>).AutomatedAnimations = fake.api;
    refreshAutoAnimationsCapabilities();

    await expect(
      setItemAnimation(
        {
          uuid: item.uuid,
          menu: "range",
          primary: { menuType: "spell", animation: "firebolt", variant: "01", color: "blue" },
        },
        "op-aa-set-forbidden",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts certified Automated Animations 7.0.22", () => {
    const fake = createFakeAutomatedAnimations();
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      modules: new Map([["autoanimations", { active: true, version: "7.0.22" }]]),
    };
    (globalThis as Record<string, unknown>).AutomatedAnimations = fake.api;

    expect(refreshAutoAnimationsCapabilities()).toMatchObject({
      active: true,
      compatible: true,
      itemWrite: true,
      version: "7.0.22",
    });
  });

  it("disables writes for an uncertified Automated Animations version", () => {
    const fake = createFakeAutomatedAnimations();
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      modules: new Map([["autoanimations", { active: true, version: "6.9.9" }]]),
    };
    (globalThis as Record<string, unknown>).AutomatedAnimations = fake.api;

    const capabilities = refreshAutoAnimationsCapabilities();
    expect(capabilities).toMatchObject({
      active: true,
      compatible: false,
      itemWrite: false,
      itemRead: false,
    });
    expect(capabilities.reason).toContain("unsupported");
  });

  it("uses A-A meleeSwitch detect=automatic defaults", async () => {
    const fake = createFakeAutomatedAnimations();
    const item = new FakeFoundryDocument("Item", "weapon1", "Longsword", undefined, {
      type: "weapon",
      flags: {},
    });
    installFakeFoundry([item]);
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      modules: new Map([["autoanimations", { active: true, version: "7.0.0" }]]),
    };
    (globalThis as Record<string, unknown>).AutomatedAnimations = fake.api;
    refreshAutoAnimationsCapabilities();

    await setItemAnimation(
      {
        uuid: item.uuid,
        menu: "melee",
        primary: {
          menuType: "weapon",
          animation: "sword",
          variant: "01",
          color: "white",
        },
      },
      "op-aa-melee",
    );

    const stored = item.toObject(false) as {
      flags: { autoanimations: { meleeSwitch: { options: Record<string, unknown> } } };
    };
    expect(stored.flags.autoanimations.meleeSwitch.options).toMatchObject({
      detect: "automatic",
      returning: false,
      switchType: "on",
    });
  });

  it("treats flags mode as a full replacement without rewriting reserved fields from siblings", async () => {
    const fake = createFakeAutomatedAnimations();
    const item = new FakeFoundryDocument("Item", "spell3", "Shield", undefined, { flags: {} });
    installFakeFoundry([item]);
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      modules: new Map([["autoanimations", { active: true, version: "7.0.17" }]]),
    };
    (globalThis as Record<string, unknown>).AutomatedAnimations = fake.api;
    refreshAutoAnimationsCapabilities();

    await setItemAnimation(
      {
        uuid: item.uuid,
        flags: {
          menu: "aura",
          isEnabled: true,
          isCustomized: true,
          label: "Custom Aura",
          primary: {
            video: {
              dbSection: "static",
              menuType: "spell",
              animation: "spiritguardians",
              variant: "01",
              color: "blue",
            },
          },
        },
      },
      "op-aa-flags-mode",
    );

    const stored = item.toObject(false) as { flags: { autoanimations: Record<string, unknown> } };
    expect(stored.flags.autoanimations).toMatchObject({
      menu: "aura",
      isEnabled: true,
      isCustomized: true,
      label: "Custom Aura",
      version: 5,
    });
  });
});
