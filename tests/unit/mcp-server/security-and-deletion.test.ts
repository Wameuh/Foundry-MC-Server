import { describe, expect, it } from "vitest";

import {
  computeBridgeHmac,
  verifyBridgeAuthentication
} from "../../../apps/mcp-server/src/bridge/authentication.js";
import {
  ConfirmationStore,
  hashDeletionTargets
} from "../../../apps/mcp-server/src/deletion/confirmation-store.js";
import { AppError } from "../../../apps/mcp-server/src/errors.js";
import { bearerTokenMatches } from "../../../apps/mcp-server/src/security/mcp-auth.js";
import { assertSafeJson } from "../../../apps/mcp-server/src/security/safe-json.js";

describe("MCP bearer authentication", () => {
  it("requires the exact bearer token", () => {
    expect(bearerTokenMatches("Bearer correct-token-value", "correct-token-value")).toBe(true);
    expect(bearerTokenMatches("Bearer wrong-token-value", "correct-token-value")).toBe(false);
    expect(bearerTokenMatches(undefined, "correct-token-value")).toBe(false);
  });
});

describe("Foundry bridge authentication", () => {
  it("binds the proof to nonce, world and user", () => {
    const secret = "bridge-secret-long-enough";
    const nonce = "a".repeat(64);
    const proof = {
      type: "auth.proof" as const,
      nonce,
      worldId: "world-one",
      userId: "gm-one",
      hmac: computeBridgeHmac(secret, nonce, "world-one", "gm-one")
    };
    expect(verifyBridgeAuthentication(proof, nonce, secret, "world-one")).toBe(true);
    expect(verifyBridgeAuthentication(proof, nonce, secret, "world-two")).toBe(false);
  });
});

describe("safe JSON", () => {
  it("rejects prototype pollution keys at any depth", () => {
    const payload = JSON.parse('{"nested":{"__proto__":{"admin":true}}}') as unknown;
    expect(() => assertSafeJson(payload)).toThrow(AppError);
  });
});

describe("deletion confirmations", () => {
  it("hashes an unordered target set deterministically", () => {
    expect(hashDeletionTargets(["Actor.b", "Actor.a"])).toBe(hashDeletionTargets(["Actor.a", "Actor.b"]));
  });

  it("is bound to the targets and can be consumed only once", () => {
    const store = new ConfirmationStore(60_000);
    const prepared = store.create(["Actor.a", "Actor.b"]);
    expect(() => store.consume({
      confirmationToken: prepared.token,
      targetHash: prepared.targetHash,
      uuids: ["Actor.a"]
    })).toThrowError(/targets/i);

    store.consume({
      confirmationToken: prepared.token,
      targetHash: prepared.targetHash,
      uuids: ["Actor.b", "Actor.a"]
    });
    expect(() => store.consume({
      confirmationToken: prepared.token,
      targetHash: prepared.targetHash,
      uuids: ["Actor.a", "Actor.b"]
    })).toThrowError(/invalid or expired/i);
  });
});
