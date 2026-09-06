import { Hono } from "hono";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  config: () => ({ BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 31 }),
}));

import {
  CursorMalformedMessage,
  CursorTimeWindowMismatchMessage,
  InvalidRequestMessage,
  InvalidTimeOrderMessage,
  TimeRangeTooLargeMessage,
} from "../error";
import { encodeUserRtpCursor } from "./rtp-users.cursor";
import { createUserRtpHandler } from "./rtp-users.handler";

describe(createUserRtpHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("validates and executes a paged report", async () => {
      fixtures.given.dataSource.report([
        {
          user_id: "player-2",
          currency: "USD",
          rounds: "2",
          total_bet: "200",
          total_win: "250",
          rolled_back_bet: "10",
          rolled_back_win: "5",
        },
      ]);

      const query = fixtures.given.query();
      const cursor = fixtures.given.cursor();
      const response = await fixtures.when.get({
        ...query,
        cursor,
        limit: "25",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: [
          {
            user_id: "player-2",
            currency: "USD",
            rounds: 2,
            total_bet: 200,
            total_win: 250,
            rolled_back_bet: 10,
            rolled_back_win: 5,
            rtp: 1.25,
          },
        ],
        next_cursor: null,
      });
      fixtures.then.dataSource.queriedFromCursor("player-1", "USD", 26);
    });
  });

  it("rejects malformed input before database access", async () => {
    const response = await fixtures.when.get({
      ...fixtures.given.query(),
      extra: true,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(InvalidRequestMessage);
    fixtures.then.dataSource.notCalled();
  });

  it.each([
    { from: "2025-12-31T00:00:00.000Z" },
    { to: "2026-01-03T00:00:00.000Z" },
  ])("rejects a cursor when the report window changes: %j", async (change) => {
    const query = fixtures.given.query();
    const response = await fixtures.when.get({
      ...query,
      ...change,
      cursor: fixtures.given.cursor(),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(CursorTimeWindowMismatchMessage);
    fixtures.then.dataSource.notCalled();
  });

  it.each([
    ["swappedWindow", InvalidTimeOrderMessage],
    ["brokenCursor", CursorMalformedMessage],
    ["rangeTooLarge", TimeRangeTooLargeMessage],
  ] as const)("rejects an invalid report query: %s", async (kind, body) => {
    const query = fixtures.given.query();
    const invalidQuery =
      kind === "swappedWindow"
        ? { ...query, from: query.to, to: query.from }
        : kind === "brokenCursor"
          ? { ...query, cursor: "broken" }
          : { from: query.from, to: "2026-02-02T00:00:00.000Z" };

    const response = await fixtures.when.get(invalidQuery);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(body);
    fixtures.then.dataSource.notCalled();
  });

  it("rethrows unexpected failures for the HTTP error handler", async () => {
    const error = new Error("connection lost");
    fixtures.given.dataSource.throws(error);

    await expect(fixtures.when.get(fixtures.given.query())).rejects.toBe(error);
  });
});

function getFixtures() {
  const defaultQuery = {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-02T00:00:00.000Z",
  };
  const queryDatabase = vi.fn().mockResolvedValue([]);
  const dataSource = { query: queryDatabase } as unknown as DataSource;
  const app = new Hono();
  const handler = createUserRtpHandler(dataSource);

  app.get("/", handler);
  app.onError((error) => {
    throw error;
  });

  return {
    given: {
      query() {
        return { ...defaultQuery };
      },
      cursor(
        overrides: Partial<{
          user_id: string;
          currency: string;
          from: string;
          to: string;
        }> = {},
      ) {
        return encodeUserRtpCursor({
          user_id: "player-1",
          currency: "USD",
          ...defaultQuery,
          ...overrides,
        });
      },
      dataSource: {
        report(
          rows: {
            user_id: string;
            currency: string;
            rounds: string;
            total_bet: string;
            total_win: string;
            rolled_back_bet: string;
            rolled_back_win: string;
          }[],
        ) {
          queryDatabase.mockResolvedValue(rows);
        },
        throws(error: Error) {
          queryDatabase.mockRejectedValue(error);
        },
      },
    },
    when: {
      get(querystring: unknown) {
        const search = new URLSearchParams(
          querystring as Record<string, string>,
        );
        return app.request(`/?${search.toString()}`);
      },
    },
    then: {
      dataSource: {
        notCalled() {
          expect(queryDatabase).not.toHaveBeenCalled();
        },
        queriedFromCursor(userId: string, currency: string, limit: number) {
          expect(
            (queryDatabase.mock.calls[0]?.[1] as unknown[] | undefined)?.slice(
              6,
            ),
          ).toEqual([userId, currency, limit]);
        },
      },
    },
  };
}
