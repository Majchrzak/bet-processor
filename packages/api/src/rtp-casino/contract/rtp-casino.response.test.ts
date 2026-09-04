import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CasinoRtpReportResponseSchema } from "./rtp-casino.response";

describe("CasinoRtpReportResponseSchema", () => {
  it("accepts casino rows and rejects user fields", () => {
    const totals = {
      currency: "USD",
      rounds: 2,
      total_bet: 100,
      total_win: 95,
      rolled_back_bet: 10,
      rolled_back_win: 5,
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

  it("rejects integers that cannot be represented safely in JSON", () => {
    expect(() =>
      CasinoRtpReportResponseSchema.parse({
        data: [
          {
            currency: "USD",
            rounds: Number.MAX_SAFE_INTEGER + 1,
            total_bet: 100,
            total_win: 95,
            rolled_back_bet: 10,
            rolled_back_win: 5,
            rtp: 0.95,
          },
        ],
      }),
    ).toThrow(z.ZodError);
  });
});
