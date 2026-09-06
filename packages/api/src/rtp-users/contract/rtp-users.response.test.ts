import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  UserRtpReportResponseSchema,
  type UserRtpReportResponse,
  type UserRtpReportRow,
} from "./rtp-users.response";

describe("user rtp report response schema", () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("requires user IDs in response rows", () => {
      const body = fixtures.given.response();

      fixtures.then.response.succeeds(fixtures.when.parseResponse(body), body);
      expectTypeOf(body).toEqualTypeOf<UserRtpReportResponse>();
    });

    it("accepts signed effective totals for rollback-only windows", () => {
      const body = fixtures.given.response({
        data: [
          fixtures.given.row({
            total_bet: -100,
            total_win: -95,
          }),
        ],
      });

      fixtures.then.response.succeeds(fixtures.when.parseResponse(body), body);
    });

    it.each([null, "opaque-cursor"] as const)(
      "accepts next_cursor %s",
      (next_cursor) => {
        const body = fixtures.given.response({ next_cursor });

        fixtures.then.response.succeeds(
          fixtures.when.parseResponse(body),
          body,
        );
      },
    );
  });

  describe("response rejections", () => {
    it("rejects rows without user_id", () => {
      fixtures.then.response.fails(
        fixtures.when.parseResponse({
          data: [fixtures.given.rowWithoutUserId()],
          next_cursor: null,
        }),
      );
    });

    it.each([
      ["unsafe total_bet", { total_bet: Number.MAX_SAFE_INTEGER + 1 }],
      ["unknown fields", { unexpected: true }],
    ] as const)("rejects %s", (_label, overrides) => {
      fixtures.then.response.fails(
        fixtures.when.parseResponse({
          data: [{ ...fixtures.given.row(), ...overrides }],
          next_cursor: null,
        }),
      );
    });
  });
});

function getFixtures() {
  const row = (
    overrides: Partial<UserRtpReportRow> = {},
  ): UserRtpReportRow => ({
    user_id: "player",
    currency: "USD",
    rounds: 2,
    total_bet: 100,
    total_win: 95,
    rolled_back_bet: 10,
    rolled_back_win: 5,
    rtp: 0.95,
    ...overrides,
  });

  return {
    given: {
      row,

      rowWithoutUserId(): Omit<UserRtpReportRow, "user_id"> {
        const {
          currency,
          rounds,
          total_bet,
          total_win,
          rolled_back_bet,
          rolled_back_win,
          rtp,
        } = row();

        return {
          currency,
          rounds,
          total_bet,
          total_win,
          rolled_back_bet,
          rolled_back_win,
          rtp,
        };
      },

      response(
        overrides: Partial<UserRtpReportResponse> = {},
      ): UserRtpReportResponse {
        return {
          data: [row()],
          next_cursor: null,
          ...overrides,
        };
      },
    },

    when: {
      parseResponse(body: unknown) {
        return UserRtpReportResponseSchema.safeParse(body);
      },
    },

    then: {
      response: {
        succeeds(
          result: ReturnType<typeof UserRtpReportResponseSchema.safeParse>,
          expected: UserRtpReportResponse,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(
          result: ReturnType<typeof UserRtpReportResponseSchema.safeParse>,
        ) {
          expect(result.success).toBe(false);
        },
      },
    },
  };
}
