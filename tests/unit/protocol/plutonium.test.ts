import { describe, expect, it } from "vitest";
import {
  PlutoniumCapabilitiesSchema,
  PlutoniumEntriesImportSchema,
  PlutoniumReferenceImportSchema
} from "../../../packages/protocol/src/index.js";

describe("Plutonium schemas", () => {
  it("accepts a deterministic world reference import", () => {
    expect(
      PlutoniumReferenceImportSchema.safeParse({
        type: "spell",
        name: "Fireball",
        source: "PHB",
        destination: { type: "world" }
      }).success
    ).toBe(true);
  });

  it("rejects reference imports without a source or with an actor destination", () => {
    expect(
      PlutoniumReferenceImportSchema.safeParse({
        type: "spell",
        name: "Fireball",
        destination: { type: "actor", actorUuid: "Actor.12345678" }
      }).success
    ).toBe(false);
  });

  it("requires prop and data.__prop to match", () => {
    const result = PlutoniumEntriesImportSchema.safeParse({
      entries: [
        {
          prop: "spell",
          data: {
            name: "Fireball",
            source: "PHB",
            __prop: "creature"
          }
        }
      ],
      destination: { type: "world" }
    });

    expect(result.success).toBe(false);
  });

  it("models an unavailable module without inventing a version", () => {
    const parsed = PlutoniumCapabilitiesSchema.parse({
      active: false,
      compatible: false,
      importReference: false,
      importJson: false,
      importers: [],
      destinations: [],
      reason: "Module not installed"
    });

    expect(parsed.version).toBeUndefined();
  });
});
