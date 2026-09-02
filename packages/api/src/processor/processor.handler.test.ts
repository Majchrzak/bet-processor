import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessorRequest } from "./contract/processor.request";
import { createProcessHandler } from "./processor.handler";
import type { ProcessorRepository } from "./processor.repository";

const requestBody: ProcessorRequest = {
  user_id: "player-1",
  currency: "USD",
  game: "slots",
  game_id: "round-1",
  actions: [{ action: "bet", action_id: "action-1", amount: 10 }],
  finished: true,
};

describe(createProcessHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  it("processes actions", async () => {
    const response = {
      balance: 90,
      game_id: "round-1",
      transactions: [{ action_id: "action-1", tx_id: "tx-1" }],
    };
    fixtures.repository.process.mockResolvedValue(response);

    await fixtures.when.handle(requestBody);

    expect(fixtures.repository.process).toHaveBeenCalledWith(requestBody);
    fixtures.then.sent(response);
  });

  it("gets the balance when actions are absent", async () => {
    fixtures.repository.getBalance.mockResolvedValue({ balance: 100 });

    await fixtures.when.handle({ ...requestBody, actions: [] });

    expect(fixtures.repository.getBalance).toHaveBeenCalledOnce();
    expect(fixtures.repository.process).not.toHaveBeenCalled();
    fixtures.then.sent({ balance: 100 });
  });

  it("rejects an invalid request before repository access", async () => {
    await fixtures.when.handle({ ...requestBody, unexpected: true });

    fixtures.then.sent({ message: "Invalid request" }, 400);
    expect(fixtures.repository.getBalance).not.toHaveBeenCalled();
    expect(fixtures.repository.process).not.toHaveBeenCalled();
  });

  it("returns 404 when the wallet does not exist", async () => {
    fixtures.repository.getBalance.mockResolvedValue(undefined);

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
    fixtures.repository.process.mockRejectedValue({ driverError: { code } });

    await fixtures.when.handle(requestBody);

    fixtures.then.sent(body, status);
  });

  it("rethrows unexpected failures for Fastify", async () => {
    const error = new Error("connection lost");
    fixtures.repository.process.mockRejectedValue(error);

    await expect(fixtures.when.handle(requestBody)).rejects.toBe(error);
  });
});

function getFixtures() {
  const repository = {
    getBalance: vi.fn<ProcessorRepository["getBalance"]>(),
    process: vi.fn<ProcessorRepository["process"]>(),
  };
  const send = vi.fn((payload: unknown) => payload);
  const code = vi.fn(() => reply);
  const reply = { code, send } as unknown as FastifyReply;
  const handler = createProcessHandler(repository);

  return {
    repository,

    when: {
      async handle(body: unknown) {
        const request = { body } as FastifyRequest<{
          Body: ProcessorRequest;
        }>;
        return await handler.handle(request, reply);
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
