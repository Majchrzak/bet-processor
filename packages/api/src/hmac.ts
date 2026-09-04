import { createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_SHA256_AUTHORIZATION_SCHEME = "HMAC-SHA256";

const HMAC_SHA256_AUTHORIZATION_PATTERN = /^HMAC-SHA256 ([a-fA-F0-9]{64})$/u;

export function createHmacSha256Digest(
  body: string | Uint8Array,
  secret: string,
): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyHmacSha256Digest(
  body: string | Uint8Array,
  secret: string,
  digest: string,
): boolean {
  if (!/^[a-fA-F0-9]{64}$/u.test(digest)) {
    return false;
  }

  const expected = Buffer.from(createHmacSha256Digest(body, secret), "hex");
  const received = Buffer.from(digest, "hex");
  return timingSafeEqual(expected, received);
}

export function verifyHmacSha256Authorization(
  body: string | Uint8Array,
  secret: string,
  authorization: string | undefined,
): boolean {
  if (authorization === undefined) {
    return false;
  }

  const match = HMAC_SHA256_AUTHORIZATION_PATTERN.exec(authorization);
  const digest = match?.[1];

  return digest !== undefined && verifyHmacSha256Digest(body, secret, digest);
}
