import { describe, expect, it } from "vitest";
import { z } from "zod";

import { UserRtpReportResponseSchema } from "./rtp-users.response";

const totals = {
  currency: "USD",
  rounds: "2",
  total_bet: "100",
  total_win: "95",
  rtp: 0.95,
};

describe("UserRtpReportResponseSchema", () => {
  it("requires user IDs in response rows", () => {
    expect(
      UserRtpReportResponseSchema.parse({
        data: [{ ...totals, user_id: "player" }],
        next_cursor: null,
      }),
    ).toEqual({ data: [{ ...totals, user_id: "player" }], next_cursor: null });
    expect(() =>
      UserRtpReportResponseSchema.parse({
        data: [totals],
        next_cursor: null,
      }),
    ).toThrow(z.ZodError);
  });
});
