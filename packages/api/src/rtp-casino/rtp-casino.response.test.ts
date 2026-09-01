import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CasinoRtpReportResponseSchema } from "./rtp-casino.response";

describe("CasinoRtpReportResponseSchema", () => {
  it("accepts casino rows and rejects user fields", () => {
    const totals = {
      currency: "USD",
      rounds: "2",
      total_bet: "100",
      total_win: "95",
      rtp: 0.95,
    };

    expect(CasinoRtpReportResponseSchema.parse({ data: [totals] })).toEqual({
      data: [totals],
    });
    expect(() =>
      CasinoRtpReportResponseSchema.parse({
        data: [{ ...totals, user_id: "player" }],
      }),
    ).toThrow(z.ZodError);
  });
});
