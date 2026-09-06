import { createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_SHA256_AUTHORIZATION_SCHEME = "HMAC-SHA256";

const AUTHORIZATION_PATTERN = /^HMAC-SHA256 ([a-fA-F0-9]{64})$/u;
const DIGEST_HEX_PATTERN = /^[a-fA-F0-9]{64}$/u;

function digestBytes(body: string | Uint8Array, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function createHmacSha256Digest(
  body: string | Uint8Array,
  secret: string,
): string {
  return digestBytes(body, secret).toString("hex");
}

export function verifyHmacSha256Authorization(
  body: string | Uint8Array,
  secret: string,
  authorization: string | undefined,
): boolean {
  if (authorization === undefined) {
    return false;
  }

  const match = AUTHORIZATION_PATTERN.exec(authorization);
  const digest = match?.[1];

  if (digest === undefined || !DIGEST_HEX_PATTERN.test(digest)) {
    return false;
  }

  const expected = digestBytes(body, secret);
  const received = Buffer.from(digest, "hex");

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
