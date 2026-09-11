import { describe, expect, it } from "vitest";
import {
  ConfirmDeletionInputSchema,
  DeletionPlanSchema,
  PrepareDeletionInputSchema
} from "../../../packages/protocol/src/index.js";

describe("two-phase deletion schemas", () => {
  it("requires at least one unique target preparation payload", () => {
    expect(PrepareDeletionInputSchema.safeParse({ uuids: [] }).success).toBe(false);
    expect(
      PrepareDeletionInputSchema.safeParse({
        uuids: ["Actor.12345678"],
        reason: "Requested by the GM"
      }).success
    ).toBe(true);
  });

  it("accepts a complete deletion plan", () => {
    expect(
      DeletionPlanSchema.safeParse({
        confirmationToken: "token".repeat(8),
        expiresAt: "2026-09-11T10:00:00.000Z",
        targetHash: "a".repeat(64),
        targets: [
          {
            uuid: "Actor.12345678",
            documentType: "Actor",
            name: "Arannis"
          }
        ],
        consequences: ["The actor and its embedded documents will be deleted."]
      }).success
    ).toBe(true);
  });

  it("rejects malformed or incomplete confirmation", () => {
    expect(
      ConfirmDeletionInputSchema.safeParse({
        confirmationToken: "short",
        targetHash: "not-sha256",
        uuids: ["Actor.12345678"]
      }).success
    ).toBe(false);
  });
});
