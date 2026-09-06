import { Hono } from "hono";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  config: () => ({ BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 31 }),
}));

import { InvalidRequestMessage, InvalidTimeOrderMessage } from "../error";
import { createCasinoRtpHandler } from "./rtp-casino.handler";

describe(createCasinoRtpHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("validates and executes a casino report", async () => {
      fixtures.given.dataSource.report([
        {
          currency: "USD",
          rounds: "0",
          total_bet: "0",
          total_win: "-100",
          rolled_back_bet: "0",
          rolled_back_win: "100",
        },
      ]);

      const query = fixtures.given.query();
      const response = await fixtures.when.get(query);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: [
          {
            currency: "USD",
            rounds: 0,
            total_bet: 0,
            total_win: -100,
            rolled_back_bet: 0,
            rolled_back_win: 100,
            rtp: null,
          },
        ],
      });
      fixtures.then.dataSource.queriedBetween(query.from, query.to);
    });
  });

  it("rejects malformed input before database access", async () => {
    const response = await fixtures.when.get({
      ...fixtures.given.query(),
      unexpected: true,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(InvalidRequestMessage);
    fixtures.then.dataSource.notCalled();
  });

  it("rejects an invalid window before database access", async () => {
    const query = fixtures.given.query();
    const response = await fixtures.when.get(query);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(InvalidTimeOrderMessage);
    fixtures.then.dataSource.notCalled();
  });

  it("rethrows unexpected failures for the HTTP error handler", async () => {
    const error = new Error("connection lost");
    fixtures.given.dataSource.throws(error);

    await expect(fixtures.when.get(fixtures.given.query())).rejects.toBe(error);
  });
});

function getFixtures() {
  const queryDatabase = vi.fn().mockResolvedValue([]);
  const dataSource = { query: queryDatabase } as unknown as DataSource;
  const app = new Hono();
  const handler = createCasinoRtpHandler(dataSource);

  app.get("/", handler);
  app.onError((error) => {
    throw error;
  });

  return {
    given: {
      query() {
        return {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-02T00:00:00.000Z",
        };
      },
      dataSource: {
        report(
          rows: {
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
        queriedBetween(from: string, to: string) {
          expect(
            (queryDatabase.mock.calls[0]?.[1] as unknown[] | undefined)?.slice(
              0,
              2,
            ),
          ).toEqual([from, to]);
        },
      },
    },
  };
}
