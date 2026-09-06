import { beforeEach, describe, expect, it } from "vitest";

import {
  UserRtpReportQuerySchema,
  type UserRtpReportQuery,
} from "./rtp-users.request";

describe("user rtp report query schema", () => {
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
      const result = fixtures.when.parseQuery({ from, to });

      fixtures.then.query.succeeds(result, {
        from,
        to,
        limit: 100,
      });
    });

    it("accepts cursor and limit overrides", () => {
      const query = {
        from: "2026-01-02T03:04:05Z",
        to: "2026-01-03T03:04:05Z",
        cursor: "opaque-cursor",
        limit: 25,
      };

      fixtures.then.query.succeeds(fixtures.when.parseQuery(query), query);
    });
  });

  describe("query rejections", () => {
    it.each([
      [
        "date without time and timezone",
        {
          from: "2026-01-02",
          to: "2026-01-03T03:04:05.006Z",
        },
      ],
      [
        "limit above maximum",
        {
          from: "2026-01-02T03:04:05Z",
          to: "2026-01-03T03:04:05Z",
          limit: 1_001,
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
        overrides: Partial<UserRtpReportQuery> = {},
      ): Partial<UserRtpReportQuery> {
        return {
          from: "2026-01-02T03:04:05Z",
          to: "2026-01-03T03:04:05Z",
          ...overrides,
        };
      },
    },

    when: {
      parseQuery(body: unknown) {
        return UserRtpReportQuerySchema.safeParse(body);
      },
    },

    then: {
      query: {
        succeeds(
          result: ReturnType<typeof UserRtpReportQuerySchema.safeParse>,
          expected: UserRtpReportQuery,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof UserRtpReportQuerySchema.safeParse>) {
          expect(result.success).toBe(false);
        },
      },
    },
  };
}
