import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  config: () => ({ BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 31 }),
}));

import { createCasinoRtpHandler } from "./rtp-casino.handler";

const query = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
};

describe(createCasinoRtpHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  it("validates and executes a casino report", async () => {
    fixtures.query.mockResolvedValue([
      {
        currency: "USD",
        rounds: "0",
        total_bet: "0",
        total_win: "-100",
        rolled_back_bet: "0",
        rolled_back_win: "100",
      },
    ]);
    await fixtures.when.handle(query);

    expect(fixtures.parameters()?.slice(0, 2)).toEqual([
      query.from,
      query.to,
    ]);
    fixtures.then.sent({
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
  });

  it("rejects malformed input before database access", async () => {
    await fixtures.when.handle({ ...query, unexpected: true });

    fixtures.then.sent({ message: "Invalid request" }, 400);
    expect(fixtures.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid window before database access", async () => {
    await fixtures.when.handle({ from: query.to, to: query.from });

    fixtures.then.sent({ message: "from must be earlier than to" }, 400);
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
  const handler = createCasinoRtpHandler(dataSource);

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
