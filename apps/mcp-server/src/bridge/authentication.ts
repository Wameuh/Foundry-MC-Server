import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type BridgeAuthentication = {
  type: "auth.proof";
  nonce: string;
  worldId: string;
  userId: string;
  hmac: string;
};

export function createBridgeNonce(): string {
  return randomBytes(32).toString("hex");
}

export function computeBridgeHmac(secret: string, nonce: string, worldId: string, userId: string): string {
  return createHmac("sha256", secret).update(`${nonce}:${worldId}:${userId}`, "utf8").digest("hex");
}

export function verifyBridgeAuthentication(
  message: BridgeAuthentication,
  expectedNonce: string,
  secret: string,
  targetWorldId: string
): boolean {
  if (message.nonce !== expectedNonce || message.worldId !== targetWorldId) return false;
  if (!/^[a-f\d]{64}$/i.test(message.hmac)) return false;
  const expected = Buffer.from(computeBridgeHmac(secret, message.nonce, message.worldId, message.userId), "hex");
  const presented = Buffer.from(message.hmac, "hex");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
