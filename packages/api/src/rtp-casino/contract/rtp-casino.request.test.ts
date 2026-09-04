import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CasinoRtpReportQuerySchema } from "./rtp-casino.request";

describe("CasinoRtpReportQuerySchema", () => {
  it.each([
    ["2026-01-02T03:04:05Z", "2026-01-03T03:04:05Z"],
    ["2026-01-02T03:04:05.006Z", "2026-01-03T03:04:05.006Z"],
    ["2026-01-02T04:04:05+01:00", "2026-01-03T04:04:05+01:00"],
  ])("accepts ISO datetimes", (from, to) => {
    expect(() => CasinoRtpReportQuerySchema.parse({ from, to })).not.toThrow();
  });

  it("rejects a date without a time and timezone", () => {
    expect(() =>
      CasinoRtpReportQuerySchema.parse({
        from: "2026-01-02",
        to: "2026-01-03T03:04:05Z",
      }),
    ).toThrow(z.ZodError);
  });
});
