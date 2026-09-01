import { describe, expect, it } from "vitest";
import { z } from "zod";

import { UserRtpReportQuerySchema } from "./rtp-users.request";

describe("UserRtpReportQuerySchema", () => {
  it("requires exact datetimes and defaults the page limit", () => {
    expect(
      UserRtpReportQuerySchema.parse({
        from: "2026-01-02T03:04:05.006Z",
        to: "2026-01-03T03:04:05.006Z",
      }).limit,
    ).toBe(100);
    expect(() =>
      UserRtpReportQuerySchema.parse({
        from: "2026-01-02",
        to: "2026-01-03T03:04:05.006Z",
      }),
    ).toThrow(z.ZodError);
  });
});
