import { describe, expect, it } from "vitest";

import { calculateTimeBucketBounds, parseTimeWindow } from "./time";

describe("report time utilities", () => {
  it("splits a range at complete UTC hour and day boundaries", () => {
    const window = parseTimeWindow(
      "2026-01-01T10:15:00.000Z",
      "2026-01-03T12:30:00.000Z",
      31,
    );

    expect(calculateTimeBucketBounds(window)).toEqual({
      hourFrom: "2026-01-01T11:00:00.000Z",
      hourTo: "2026-01-03T12:00:00.000Z",
      dayFrom: "2026-01-02T00:00:00.000Z",
      dayTo: "2026-01-03T00:00:00.000Z",
    });
  });

  it("rejects empty, reversed, and over-limit windows", () => {
    expect(() =>
      parseTimeWindow(
        "2026-01-02T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        31,
      ),
    ).toThrow("from must be earlier than to");
    expect(() =>
      parseTimeWindow(
        "2026-01-02T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        31,
      ),
    ).toThrow("from must be earlier than to");
    expect(() =>
      parseTimeWindow(
        "2026-01-01T00:00:00.000Z",
        "2026-02-02T00:00:00.000Z",
        31,
      ),
    ).toThrow("report range must not exceed 31 days");
  });
});
