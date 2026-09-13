import { describe, expect, it } from "vitest";
import { buildItemAnimationFlags } from "../../../apps/foundry-module/src/integrations/autoanimations/flag-builder.js";

describe("Automated Animations flag builder", () => {
  it("builds customized range flags for a spell animation", () => {
    const flags = buildItemAnimationFlags({
      label: "Fire Bolt",
      menu: "range",
      isEnabled: true,
      merge: false,
      primary: {
        menuType: "spell",
        animation: "firebolt",
        variant: "01",
        color: "orange"
      }
    });

    expect(flags.menu).toBe("range");
    expect(flags.isCustomized).toBe(true);
    expect(flags.version).toBe(5);
    expect((flags.primary as { video: Record<string, unknown> }).video).toMatchObject({
      dbSection: "range",
      menuType: "spell",
      animation: "firebolt",
      variant: "01",
      color: "orange"
    });
  });

  it("merges primary video onto an existing matching menu", () => {
    const existing = buildItemAnimationFlags({
      label: "Fire Bolt",
      menu: "range",
      isEnabled: true,
      merge: false,
      primary: {
        menuType: "spell",
        animation: "firebolt",
        variant: "01",
        color: "orange"
      }
    });

    const merged = buildItemAnimationFlags({
      label: "Fire Bolt",
      menu: "range",
      isEnabled: true,
      merge: true,
      existing,
      primary: {
        menuType: "spell",
        animation: "firebolt",
        variant: "01",
        color: "purple"
      }
    });

    expect((merged.primary as { video: { color: string } }).video.color).toBe("purple");
    expect(merged.id).toBe(existing.id);
  });
});
