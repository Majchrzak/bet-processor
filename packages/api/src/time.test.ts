import { describe, expect, it } from "vitest";

import {
  calculateTimeBucketBounds,
  InvalidTimeOrder,
  parseTimeWindow,
  TimeRangeTooLarge,
} from "./time";

describe(parseTimeWindow.name, () => {
  describe("happy path", () => {
    it("parses a valid window", () => {
      expect(
        parseTimeWindow(
          "2026-01-01T10:15:00.000Z",
          "2026-01-03T12:30:00.000Z",
          31,
        ),
      ).toEqual({
        from: new Date("2026-01-01T10:15:00.000Z"),
        to: new Date("2026-01-03T12:30:00.000Z"),
      });
    });
  });

  describe("validation", () => {
    it.each([
      [
        "equal bounds",
        "2026-01-02T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        InvalidTimeOrder,
      ],
      [
        "reversed bounds",
        "2026-01-02T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        InvalidTimeOrder,
      ],
      [
        "range too large",
        "2026-01-01T00:00:00.000Z",
        "2026-02-02T00:00:00.000Z",
        TimeRangeTooLarge,
      ],
    ] as const)("returns %s", (_label, from, to, result) => {
      expect(parseTimeWindow(from, to, 31)).toBe(result);
    });
  });
});

describe(calculateTimeBucketBounds.name, () => {
  describe("happy path", () => {
    it("splits a range at complete UTC hour and day boundaries", () => {
      expect(
        calculateTimeBucketBounds({
          from: new Date("2026-01-01T10:15:00.000Z"),
          to: new Date("2026-01-03T12:30:00.000Z"),
        }),
      ).toEqual({
        hourFrom: "2026-01-01T11:00:00.000Z",
        hourTo: "2026-01-03T12:00:00.000Z",
        dayFrom: "2026-01-02T00:00:00.000Z",
        dayTo: "2026-01-03T00:00:00.000Z",
      });
    });
  });
});
