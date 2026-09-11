import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export function createChallengeHmac(
  secret: string,
  nonce: string,
  worldId: string,
  userId: string,
): string {
  const payload = `${nonce}:${worldId}:${userId}`;
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
}
