import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  CasinoRtpReportResponseSchema,
  type CasinoRtpReportResponse,
  type CasinoRtpReportRow,
} from "./rtp-casino.response";

describe("casino rtp report response schema", () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("accepts casino rows without user fields", () => {
      const body = fixtures.given.response();

      fixtures.then.response.succeeds(fixtures.when.parseResponse(body), body);
      expectTypeOf(body).toEqualTypeOf<CasinoRtpReportResponse>();
    });

    it("accepts nullable rtp values", () => {
      const body = fixtures.given.response({
        data: [fixtures.given.row({ rtp: null })],
      });

      fixtures.then.response.succeeds(fixtures.when.parseResponse(body), body);
    });
  });

  describe("response rejections", () => {
    it("rejects user fields on casino rows", () => {
      fixtures.then.response.fails(
        fixtures.when.parseResponse({
          data: [{ ...fixtures.given.row(), user_id: "player" }],
        }),
      );
    });

    it.each([
      ["unsafe rounds", { rounds: Number.MAX_SAFE_INTEGER + 1 }],
      ["unsafe total_bet", { total_bet: Number.MAX_SAFE_INTEGER + 1 }],
      ["unknown fields", { unexpected: true }],
    ] as const)("rejects %s", (_label, overrides) => {
      fixtures.then.response.fails(
        fixtures.when.parseResponse({
          data: [{ ...fixtures.given.row(), ...overrides }],
        }),
      );
    });
  });
});

function getFixtures() {
  const row = (
    overrides: Partial<CasinoRtpReportRow> = {},
  ): CasinoRtpReportRow => ({
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

      response(
        overrides: Partial<CasinoRtpReportResponse> = {},
      ): CasinoRtpReportResponse {
        return {
          data: [row()],
          ...overrides,
        };
      },
    },

    when: {
      parseResponse(body: unknown) {
        return CasinoRtpReportResponseSchema.safeParse(body);
      },
    },

    then: {
      response: {
        succeeds(
          result: ReturnType<typeof CasinoRtpReportResponseSchema.safeParse>,
          expected: CasinoRtpReportResponse,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(
          result: ReturnType<typeof CasinoRtpReportResponseSchema.safeParse>,
        ) {
          expect(result.success).toBe(false);
        },
      },
    },
  };
}
