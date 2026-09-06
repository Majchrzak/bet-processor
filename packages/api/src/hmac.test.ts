import { describe, expect, it } from "vitest";

import { createHmacSha256Digest, verifyHmacSha256Authorization } from "./hmac";

describe(createHmacSha256Digest.name, () => {
  const secret = "test";
  const rawBody =
    '{"user_id":"8|USDT|USD","currency":"USD","game":"acceptance:test"}';

  it("matches the HMAC quick-reference signature", () => {
    expect(createHmacSha256Digest(rawBody, secret)).toBe(
      "442c4cd8926008096225416b21f5a1862fbf4fc4e5224362e3b463e85a39f40a",
    );
  });

  it("rejects a tampered body on verify", () => {
    const digest = createHmacSha256Digest(rawBody, secret);

    expect(
      verifyHmacSha256Authorization(
        `${rawBody}\n`,
        secret,
        `HMAC-SHA256 ${digest}`,
      ),
    ).toBe(false);
  });
});

describe(verifyHmacSha256Authorization.name, () => {
  const body = Buffer.from('{"value":1}');
  const secret = "test-secret";
  const digest = createHmacSha256Digest(body, secret);

  it("accepts the exact authorization format", () => {
    expect(
      verifyHmacSha256Authorization(body, secret, `HMAC-SHA256 ${digest}`),
    ).toBe(true);
  });

  it.each([
    undefined,
    "",
    digest,
    `Bearer ${digest}`,
    `hmac-sha256 ${digest}`,
    `HMAC-SHA256  ${digest}`,
    `HMAC-SHA256 ${digest.slice(1)}`,
    `HMAC-SHA256 ${"g".repeat(64)}`,
    `HMAC-SHA256 malformed`,
  ])("rejects a malformed header: %s", (authorization) => {
    expect(verifyHmacSha256Authorization(body, secret, authorization)).toBe(
      false,
    );
  });
});
