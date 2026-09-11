import { describe, expect, it } from "vitest";
import {
  BridgeAuthProofSchema,
  BridgeRegistrationSchema,
  BridgeRequestSchema,
  BridgeResponseSchema,
  OperationReceiptSchema
} from "../../../packages/protocol/src/index.js";

describe("bridge protocol schemas", () => {
  it("accepts a GM registration and forward-compatible capabilities", () => {
    const parsed = BridgeRegistrationSchema.parse({
      bridgeVersion: "1.0.0",
      world: { id: "test-world", title: "Test World" },
      user: { id: "gm-id", name: "Game Master", isGM: true },
      foundry: { version: "14.367" },
      system: { id: "dnd5e", version: "5.3.3" },
      modules: {
        plutonium: { active: true, version: "2.18.1.v14", compatible: true }
      },
      capabilities: ["foundry.status", "future.capability"]
    });

    expect(parsed.capabilities).toContain("future.capability");
  });

  it("rejects a non-GM registration", () => {
    expect(() =>
      BridgeRegistrationSchema.parse({
        bridgeVersion: "1.0.0",
        world: { id: "test-world", title: "Test World" },
        user: { id: "user-id", name: "Player", isGM: false },
        foundry: { version: "14.367" },
        system: { id: "dnd5e", version: "5.3.3" },
        modules: {},
        capabilities: []
      })
    ).toThrow();
  });

  it("requires an epoch-millisecond deadline and a known operation", () => {
    expect(
      BridgeRequestSchema.safeParse({
        requestId: "request-123",
        operationId: "operation-123",
        operation: "foundry.getContext",
        payload: {},
        deadline: Date.now() + 30_000
      }).success
    ).toBe(true);

    expect(
      BridgeRequestSchema.safeParse({
        requestId: "request-123",
        operationId: "operation-123",
        operation: "foundry.executeJavascript",
        payload: {},
        deadline: "tomorrow"
      }).success
    ).toBe(false);
  });

  it("discriminates successful and failed responses", () => {
    expect(
      BridgeResponseSchema.safeParse({
        requestId: "request-123",
        ok: false,
        error: { code: "DOCUMENT_NOT_FOUND", message: "Missing actor" }
      }).success
    ).toBe(true);

    expect(
      BridgeResponseSchema.safeParse({
        requestId: "request-123",
        ok: true,
        error: { code: "INTERNAL_ERROR", message: "Invalid shape" }
      }).success
    ).toBe(false);
  });

  it("accepts only SHA-256 hex authentication proofs", () => {
    const base = {
      type: "auth.proof",
      nonce: "n".repeat(32),
      worldId: "test-world",
      userId: "gm-id"
    };

    expect(BridgeAuthProofSchema.safeParse({ ...base, hmac: "a".repeat(64) }).success).toBe(true);
    expect(BridgeAuthProofSchema.safeParse({ ...base, hmac: "not-a-hmac" }).success).toBe(false);
  });

  it("validates normalized operation receipts", () => {
    expect(
      OperationReceiptSchema.safeParse({
        operationId: "operation-123",
        status: "completed",
        provider: "plutonium",
        providerVersion: "2.18.1.v14",
        created: [{ uuid: "Item.12345678", documentType: "Item", name: "Fireball" }],
        updated: [],
        skipped: [],
        warnings: []
      }).success
    ).toBe(true);
  });
});
