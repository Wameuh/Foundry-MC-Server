import { describe, expect, it } from "vitest";
import {
  BridgeAuthProofSchema,
  BridgeRegistrationSchema,
  OperationReceiptSchema,
  AgentControlServerMessageSchema
} from "../../../packages/protocol/src/index.js";

describe("bridge protocol schemas", () => {
  it("accepts a GM registration and forward-compatible capabilities", () => {
    const parsed = BridgeRegistrationSchema.parse({
      bridgeVersion: "1.0.0",
      world: { id: "test-world", title: "Test World" },
      user: { id: "gm-id", name: "Game Master", isGM: true },
      foundry: { version: "14.370" },
      system: { id: "dnd5e", version: "6.1.1" },
      capabilities: ["foundry.control.provision", "future.capability"]
    });

    expect(parsed.capabilities).toContain("future.capability");
  });

  it("rejects a non-GM registration", () => {
    expect(() =>
      BridgeRegistrationSchema.parse({
        bridgeVersion: "1.0.0",
        world: { id: "test-world", title: "Test World" },
        user: { id: "user-id", name: "Player", isGM: false },
        foundry: { version: "14.370" },
        system: { id: "dnd5e", version: "6.1.1" },
        capabilities: []
      })
    ).toThrow();
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

  it("validates explicit AgentControl daemon health messages", () => {
    expect(AgentControlServerMessageSchema.safeParse({
      type: "agentcontrol.daemonHealth",
      state: "error",
      message: "socket failed",
      ts: 1_700_000_000_000
    }).success).toBe(true);
    expect(AgentControlServerMessageSchema.safeParse({
      type: "agentcontrol.daemonHealth",
      state: "connecting",
      ts: 1_700_000_000_000
    }).success).toBe(false);
  });

  it("validates normalized operation receipts", () => {
    expect(
      OperationReceiptSchema.safeParse({
        operationId: "operation-123",
        status: "completed",
        provider: "plutonium",
        providerVersion: "2.20.4.v14",
        created: [{ uuid: "Item.12345678", documentType: "Item", name: "Fireball" }],
        updated: [],
        skipped: [],
        warnings: []
      }).success
    ).toBe(true);
  });
});
