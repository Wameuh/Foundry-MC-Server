import { describe, expect, it } from "vitest";
import {
  FoundryCreateDocumentsInputSchema,
  FoundrySearchDocumentsInputSchema,
  FoundryUpdateDocumentsInputSchema,
  SafeJsonObjectSchema
} from "../../../packages/protocol/src/index.js";

describe("document operation schemas", () => {
  it("applies bounded search defaults", () => {
    const value = FoundrySearchDocumentsInputSchema.parse({
      documentType: "Actor"
    });

    expect(value.query).toBe("");
    expect(value.limit).toBe(25);
  });

  it("accepts safe document creation data", () => {
    expect(
      FoundryCreateDocumentsInputSchema.safeParse({
        documentType: "Actor",
        documents: [{ name: "Arannis", type: "character", system: { details: {} } }]
      }).success
    ).toBe(true);
  });

  it("rejects dangerous properties recursively", () => {
    const unsafe = JSON.parse(
      '{"name":"Arannis","system":{"constructor":{"prototype":{"polluted":true}}}}'
    );
    expect(SafeJsonObjectSchema.safeParse(unsafe).success).toBe(false);
  });

  it.each(["_id", "system.__proto__.polluted", "parent.name", "apps.sheet"])(
    "rejects forbidden update path %s",
    (path) => {
      expect(
        FoundryUpdateDocumentsInputSchema.safeParse({
          updates: [{ uuid: "Actor.12345678", changes: { [path]: "value" } }]
        }).success
      ).toBe(false);
    }
  );

  it("accepts explicit safe update paths", () => {
    expect(
      FoundryUpdateDocumentsInputSchema.safeParse({
        updates: [
          {
            uuid: "Actor.12345678",
            changes: {
              name: "Arannis",
              "system.details.biography.value": "<p>Translated</p>"
            }
          }
        ]
      }).success
    ).toBe(true);
  });
});
