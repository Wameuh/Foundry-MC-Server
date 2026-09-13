import { describe, expect, it } from "vitest";
import {
  AutoAnimationsCapabilitiesSchema,
  AutoAnimationsSearchCatalogInputSchema,
  AutoAnimationsSetItemInputSchema
} from "../../../packages/protocol/src/index.js";

describe("Automated Animations schemas", () => {
  it("models unavailable capabilities without inventing a version", () => {
    const parsed = AutoAnimationsCapabilitiesSchema.parse({
      active: false,
      compatible: false,
      itemRead: false,
      itemWrite: false,
      autorecRead: false,
      catalogSearch: false,
      menus: [],
      reason: "Automated Animations is not installed."
    });
    expect(parsed.version).toBeUndefined();
  });

  it("accepts a primary video assignment for a spell item", () => {
    const result = AutoAnimationsSetItemInputSchema.safeParse({
      uuid: "Item.abcdefghijklmnopqrstuvwxyz",
      menu: "range",
      primary: {
        menuType: "spell",
        animation: "firebolt",
        variant: "01",
        color: "orange"
      }
    });
    expect(result.success).toBe(true);
  });

  it("rejects set-item payloads without primary or flags", () => {
    const result = AutoAnimationsSetItemInputSchema.safeParse({
      uuid: "Item.abcdefghijklmnopqrstuvwxyz",
      menu: "range"
    });
    expect(result.success).toBe(false);
  });

  it("accepts catalog search filters", () => {
    const result = AutoAnimationsSearchCatalogInputSchema.safeParse({
      query: "firebolt",
      dbSection: "range",
      limit: 20
    });
    expect(result.success).toBe(true);
  });
});
