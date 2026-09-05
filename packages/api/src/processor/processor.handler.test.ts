import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidRequestMessage } from "../error";
import type { ProcessorRequest } from "./contract/processor.request";
import { createProcessHandler } from "./processor.handler";

const ACTION_ID = "019917b8-1d4d-7e1a-8c35-3cdcf0be8d7a";

const requestBody: ProcessorRequest = {
  user_id: "player-1",
  currency: "USD",
  game: "slots",
  game_id: "round-1",
  actions: [{ action: "bet", action_id: ACTION_ID, amount: 10 }],
  finished: true,
};

describe(createProcessHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  it("processes actions using the provided time", async () => {
    fixtures.query.mockResolvedValue([
      {
        balance: "90",
        transactions: [{ action_id: ACTION_ID, tx_id: "tx-1" }],
      },
    ]);

    await fixtures.when.handle(requestBody);

    fixtures.then.sent({
      balance: 90,
      game_id: "round-1",
      transactions: [{ action_id: ACTION_ID, tx_id: "tx-1" }],
    });
    expect(fixtures.timeProvider).toHaveBeenCalledOnce();
    expect(fixtures.parameters()?.[8]).toBe(fixtures.now);
  });

  it("gets the balance without reading the time", async () => {
    fixtures.query.mockResolvedValue([{ balance: "100" }]);

    await fixtures.when.handle({ ...requestBody, actions: [] });

    fixtures.then.sent({ balance: 100 });
    expect(fixtures.timeProvider).not.toHaveBeenCalled();
  });

  it("rejects an invalid request before database or time access", async () => {
    await fixtures.when.handle({ ...requestBody, unexpected: true });

    fixtures.then.sent(InvalidRequestMessage, 400);
    expect(fixtures.query).not.toHaveBeenCalled();
    expect(fixtures.timeProvider).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID action ID before database access", async () => {
    await fixtures.when.handle({
      ...requestBody,
      actions: [{ action: "bet", action_id: "action-1", amount: 10 }],
    });

    fixtures.then.sent(InvalidRequestMessage, 400);
    expect(fixtures.query).not.toHaveBeenCalled();
    expect(fixtures.timeProvider).not.toHaveBeenCalled();
  });

  it("returns 404 when the wallet does not exist", async () => {
    fixtures.query.mockResolvedValue([]);

    await fixtures.when.handle({ ...requestBody, actions: undefined });

    fixtures.then.sent({ message: "Wallet not found" }, 404);
  });

  it.each([
    ["BP001", 404, { message: "Wallet not found" }],
    [
      "BP002",
      400,
      {
        code: 100,
        message: "Player has not enough funds to process an action",
      },
    ],
    ["BP003", 409, { message: "Game is already finished" }],
  ] as const)("maps database error %s to HTTP %s", async (code, status, body) => {
    fixtures.query.mockRejectedValue({ driverError: { code } });

    await fixtures.when.handle(requestBody);

    fixtures.then.sent(body, status);
  });

  it("rethrows unexpected failures for Fastify", async () => {
    const error = new Error("connection lost");
    fixtures.query.mockRejectedValue(error);

    await expect(fixtures.when.handle(requestBody)).rejects.toBe(error);
  });
});

function getFixtures() {
  const query = vi.fn().mockResolvedValue([]);
  const now = new Date("2026-09-02T12:34:56.789Z");
  const timeProvider = vi.fn(() => now);
  const dataSource = { query } as unknown as DataSource;
  const send = vi.fn((payload: unknown) => payload);
  const code = vi.fn(() => reply);
  const reply = { code, send } as unknown as FastifyReply;
  const handler = createProcessHandler(dataSource, timeProvider);

  return {
    now,
    query,
    timeProvider,
    parameters() {
      return query.mock.calls[0]?.[1] as unknown[] | undefined;
    },
    when: {
      async handle(body: unknown) {
        const request = { body } as FastifyRequest<{
          Body: ProcessorRequest;
        }>;
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
