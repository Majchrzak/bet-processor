import { describe, expect, it } from "vitest";
import { z } from "zod";

import { UserRtpCursorSchema } from "./rtp-users.cursor";

describe("UserRtpCursorSchema", () => {
  it("validates cursor contents strictly", () => {
    expect(
      UserRtpCursorSchema.parse({ user_id: "player", currency: "USD" }),
    ).toEqual({
      user_id: "player",
      currency: "USD",
    });
    expect(() =>
      UserRtpCursorSchema.parse({
        user_id: "player",
        currency: "USD",
        extra: true,
      }),
    ).toThrow(z.ZodError);
  });
});
