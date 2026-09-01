import { createHmac, timingSafeEqual } from "node:crypto";

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
  if (!/^[a-fA-F0-9]{64}$/u.test(digest)) return false;

  const expected = Buffer.from(createHmacSha256Digest(body, secret), "hex");
  const received = Buffer.from(digest, "hex");
  return timingSafeEqual(expected, received);
}
