import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  config: () => ({ BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 31 }),
}));

import { encodeUserRtpCursor } from "./rtp-users.cursor";
import { createUserRtpHandler } from "./rtp-users.handler";

const query = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
};

describe(createUserRtpHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  it("validates and executes a paged report", async () => {
    fixtures.query.mockResolvedValue([
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
    const cursor = encodeUserRtpCursor({
      user_id: "player-1",
      currency: "USD",
      ...query,
    });

    await fixtures.when.handle({ ...query, cursor, limit: "25" });

    expect(fixtures.parameters()?.slice(6)).toEqual(["player-1", "USD", 26]);
    fixtures.then.sent({
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
  });

  it("rejects malformed input before database access", async () => {
    await fixtures.when.handle({ ...query, extra: true });

    fixtures.then.sent({ message: "Invalid request" }, 400);
    expect(fixtures.query).not.toHaveBeenCalled();
  });

  it.each([
    { from: "2025-12-31T00:00:00.000Z" },
    { to: "2026-01-03T00:00:00.000Z" },
  ])("rejects a cursor when the report window changes: %j", async (change) => {
    const cursor = encodeUserRtpCursor({
      user_id: "player-1",
      currency: "USD",
      ...query,
    });

    await fixtures.when.handle({ ...query, ...change, cursor });

    fixtures.then.sent(
      { message: "cursor does not match report window" },
      400,
    );
    expect(fixtures.query).not.toHaveBeenCalled();
  });

  it.each([
    [
      { ...query, from: query.to, to: query.from },
      "from must be earlier than to",
    ],
    [{ ...query, cursor: "broken" }, "cursor is invalid"],
    [
      {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-02T00:00:00.000Z",
      },
      "report range must not exceed 31 days",
    ],
  ] as const)("rejects an invalid report query", async (invalidQuery, message) => {
    await fixtures.when.handle(invalidQuery);

    fixtures.then.sent({ message }, 400);
    expect(fixtures.query).not.toHaveBeenCalled();
  });

  it("rethrows unexpected failures for Fastify", async () => {
    const error = new Error("connection lost");
    fixtures.query.mockRejectedValue(error);

    await expect(fixtures.when.handle(query)).rejects.toBe(error);
  });
});

function getFixtures() {
  const queryDatabase = vi.fn().mockResolvedValue([]);
  const dataSource = { query: queryDatabase } as unknown as DataSource;
  const send = vi.fn((payload: unknown) => payload);
  const code = vi.fn(() => reply);
  const reply = { code, send } as unknown as FastifyReply;
  const handler = createUserRtpHandler(dataSource);

  return {
    query: queryDatabase,
    parameters() {
      return queryDatabase.mock.calls[0]?.[1] as unknown[] | undefined;
    },
    when: {
      async handle(querystring: unknown) {
        const request = { query: querystring } as FastifyRequest;
        return await handler(request, reply);
      },
    },
    then: {
      sent(body: unknown, status?: number) {
        if (status !== undefined) expect(code).toHaveBeenCalledWith(status);
        expect(send).toHaveBeenCalledWith(body);
      },
    },
  };
}
