import { describe, expect, it } from "vitest";

import { createHmacSha256Digest, verifyHmacSha256Digest } from "./hmac";

describe(verifyHmacSha256Digest.name, () => {
  it("matches the HMAC quick-reference signature", () => {
    const secret = "test";
    const rawBody =
      '{"user_id":"8|USDT|USD","currency":"USD","game":"acceptance:test"}';
    const digest = createHmacSha256Digest(rawBody, secret);

    expect(digest).toBe(
      "442c4cd8926008096225416b21f5a1862fbf4fc4e5224362e3b463e85a39f40a",
    );
    expect(verifyHmacSha256Digest(rawBody, secret, digest)).toBe(true);
    expect(verifyHmacSha256Digest(`${rawBody}\n`, secret, digest)).toBe(false);
    expect(verifyHmacSha256Digest(rawBody, secret, "malformed")).toBe(false);
  });
});
