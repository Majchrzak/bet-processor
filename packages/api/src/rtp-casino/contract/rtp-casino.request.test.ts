import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  CasinoRtpReportQuerySchema,
  type CasinoRtpReportQuery,
} from "./rtp-casino.request";

describe("casino rtp report query schema", () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it.each([
      ["2026-01-02T03:04:05Z", "2026-01-03T03:04:05Z"],
      ["2026-01-02T03:04:05.006Z", "2026-01-03T03:04:05.006Z"],
      ["2026-01-02T04:04:05+01:00", "2026-01-03T04:04:05+01:00"],
    ] as const)("accepts ISO datetimes: %s to %s", (from, to) => {
      const query = fixtures.given.query({ from, to });

      fixtures.then.query.succeeds(fixtures.when.parseQuery(query), query);
      expectTypeOf(query).toEqualTypeOf<CasinoRtpReportQuery>();
    });
  });

  describe("query rejections", () => {
    it.each([
      [
        "date without time and timezone",
        {
          from: "2026-01-02",
          to: "2026-01-03T03:04:05Z",
        },
      ],
      [
        "unknown fields",
        {
          from: "2026-01-02T03:04:05Z",
          to: "2026-01-03T03:04:05Z",
          unexpected: true,
        },
      ],
    ] as const)("%s", (_label, query) => {
      fixtures.then.query.fails(fixtures.when.parseQuery(query));
    });
  });
});

function getFixtures() {
  return {
    given: {
      query(
        overrides: Partial<CasinoRtpReportQuery> = {},
      ): CasinoRtpReportQuery {
        return {
          from: "2026-01-02T03:04:05Z",
          to: "2026-01-03T03:04:05Z",
          ...overrides,
        };
      },
    },

    when: {
      parseQuery(body: unknown) {
        return CasinoRtpReportQuerySchema.safeParse(body);
      },
    },

    then: {
      query: {
        succeeds(
          result: ReturnType<typeof CasinoRtpReportQuerySchema.safeParse>,
          expected: CasinoRtpReportQuery,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof CasinoRtpReportQuerySchema.safeParse>) {
          expect(result.success).toBe(false);
        },
      },
    },
  };
}
