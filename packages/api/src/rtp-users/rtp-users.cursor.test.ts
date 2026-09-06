import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  decodeUserRtpCursor,
  encodeUserRtpCursor,
  InvalidCursorString,
  UserRtpCursorSchema,
} from "./rtp-users.cursor";

describe("UserRtpCursorSchema", () => {
  it("validates cursor contents strictly", () => {
    expect(
      UserRtpCursorSchema.parse({
        user_id: "player",
        currency: "USD",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-02T00:00:00.000Z",
      }),
    ).toEqual({
      user_id: "player",
      currency: "USD",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(() =>
      UserRtpCursorSchema.parse({
        user_id: "player",
        currency: "USD",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-02T00:00:00.000Z",
        extra: true,
      }),
    ).toThrow(z.ZodError);
  });

  it("round-trips an opaque cursor", () => {
    const cursor = {
      user_id: "player",
      currency: "USD",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    };

    expect(decodeUserRtpCursor(encodeUserRtpCursor(cursor))).toEqual(cursor);
  });

  it("rejects the previous cursor format and malformed window timestamps", () => {
    const previousCursor = Buffer.from(
      JSON.stringify({ user_id: "player", currency: "USD" }),
      "utf8",
    ).toString("base64url");

    expect(decodeUserRtpCursor(previousCursor)).toBe(InvalidCursorString);
    expect(() =>
      UserRtpCursorSchema.parse({
        user_id: "player",
        currency: "USD",
        from: "not-a-timestamp",
        to: "2026-01-02T00:00:00.000Z",
      }),
    ).toThrow(z.ZodError);
  });

  it.each(["broken", "e30", "eyJ1c2VyX2lkIjoicGxheWVyIn0"])(
    "rejects an invalid cursor: %s",
    (cursor) => {
      expect(decodeUserRtpCursor(cursor)).toBe(InvalidCursorString);
    },
  );
});
