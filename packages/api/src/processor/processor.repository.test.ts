import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ProcessorRequest } from "./contract/processor.request";
import { createProcessorRepository } from "./processor.repository";

const request: ProcessorRequest = {
  user_id: "player-1",
  currency: "USD",
  game: "slots",
  game_id: "round-1",
  actions: [{ action: "bet", action_id: "action-1", amount: 10 }],
  finished: true,
};

describe(createProcessorRepository.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  it("processes an ordered action batch", async () => {
    fixtures.given.rows([
      {
        balance: "90",
        transactions: [{ action_id: "action-1", tx_id: "tx-1" }],
      },
    ]);

    await expect(fixtures.repository.process(request)).resolves.toEqual({
      balance: 90,
      game_id: "round-1",
      transactions: [{ action_id: "action-1", tx_id: "tx-1" }],
    });
    fixtures.then.queried("process_game_actions");
    expect(fixtures.parameters()?.[8]).toBe(fixtures.now);

    const actions = JSON.parse(String(fixtures.parameters()?.[7])) as Record<
      string,
      unknown
    >[];
    expect(actions[0]).toMatchObject({
      action: "bet",
      action_id: "action-1",
      amount: 10,
    });
    expect(typeof actions[0]?.action_key).toBe("string");
  });

  it("gets a wallet balance", async () => {
    fixtures.given.rows([{ balance: "100" }]);

    await expect(fixtures.repository.getBalance(request)).resolves.toEqual({
      balance: 100,
    });
    fixtures.then.queried("FROM wallet");
  });

  it("returns undefined when the wallet does not exist", async () => {
    fixtures.given.rows([]);

    await expect(
      fixtures.repository.getBalance(request),
    ).resolves.toBeUndefined();
  });

  it.each([
    { balance: 90, transactions: [] },
    { balance: "9007199254740992", transactions: [] },
  ])("rejects an invalid database result: %j", async (row) => {
    fixtures.given.rows([row]);

    await expect(fixtures.repository.process(request)).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});

function getFixtures() {
  type Query = (sql: string, parameters?: unknown[]) => Promise<unknown>;

  const query = vi.fn<Query>();
  const now = new Date("2026-09-02T12:34:56.789Z");
  const repository = createProcessorRepository({ query }, () => now);

  return {
    repository,
    now,

    parameters() {
      return query.mock.calls[0]?.[1];
    },

    given: {
      rows(rows: unknown[]) {
        query.mockResolvedValue(rows);
      },
    },

    then: {
      queried(sql: string) {
        expect(query).toHaveBeenCalledOnce();
        expect(query.mock.calls[0]?.[0]).toContain(sql);
      },
    },
  };
}
