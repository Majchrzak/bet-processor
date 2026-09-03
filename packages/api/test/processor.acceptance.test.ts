/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { createDeterministicKey } from "../src/deterministic-key";
import { createHmacSha256Digest } from "../src/hmac";
import {
  ErrorResponseSchema,
  ProcessorResponseSchema,
} from "../src/processor/contract/processor.response";

describe("bet processor HTTP integration", () => {
  let fixtures: Awaited<ReturnType<typeof getFixtures>>;

  beforeAll(async () => {
    fixtures = await getFixtures();
  });

  afterAll(async () => {
    await fixtures.dispose();
  });

  it("A. Missing Authorization → 403", async () => {
    const response = await fixtures.when.process(
      fixtures.given.unsignedRequest({
        user_id: "8|USDT|USD",
        currency: "USD",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("B. balance lookup", async () => {
    const response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user: await fixtures.given.user(74322001, "USD"),
        game: fixtures.given.game("acceptance:test"),
      }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74322001,
    });
  });

  it("C. single bet, finished (no win)", async () => {
    const user = await fixtures.given.user(74322001, "USD");
    const game = fixtures.given.game("acceptance:test");
    const actions = [fixtures.given.action.bet(100)];

    const response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions, finished: true }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74321901,
      game_id: game.gameId,
      transactions: [
        { action_id: actions[0]?.action_id, tx_id: expect.any(String) },
      ],
    });
  });

  it("D. Bet + win in the same call", async () => {
    const user = await fixtures.given.user(74321901, "USD");
    const game = fixtures.given.game("acceptance:test");
    const actions = [
      fixtures.given.action.bet(100),
      fixtures.given.action.win(250),
    ];

    const response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74322051,
      game_id: game.gameId,
      transactions: [
        { action_id: actions[0]?.action_id, tx_id: expect.any(String) },
        { action_id: actions[1]?.action_id, tx_id: expect.any(String) },
      ],
    });
  });

  it("E. Insufficient funds", async () => {
    const user = await fixtures.given.user(74322051, "USD");
    const game = fixtures.given.game("acceptance:test");
    const actions = [fixtures.given.action.bet(74322202)];

    const response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions, finished: true }),
    );

    await fixtures.then.errored(response, {
      code: 100,
      message: "Player has not enough funds to process an action",
    });
  });

  it("F. Bet then win (separate calls)", async () => {
    const user = await fixtures.given.user(74322201, "USD");
    const game = fixtures.given.game("acceptance:test");
    const actions = [
      fixtures.given.action.bet(100),
      fixtures.given.action.win(700),
    ];

    const response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions: [actions[0]] }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74322101,
      game_id: game.gameId,
      transactions: [
        { action_id: actions[0]?.action_id, tx_id: expect.any(String) },
      ],
    });

    const response2 = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions: [actions[1]],
        finished: true,
      }),
    );

    await fixtures.then.succeeded(response2, {
      balance: 74322801,
      game_id: game.gameId,
      transactions: [
        { action_id: actions[1]?.action_id, tx_id: expect.any(String) },
      ],
    });
  });

  it("G. Bet then rollback that bet", async () => {
    const user = await fixtures.given.user(74322001, "USD");
    const game = fixtures.given.game("acceptance:test");
    const bet = fixtures.given.action.bet(100);
    const rollback = fixtures.given.action.rollback(bet.action_id);

    let response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions: [bet] }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74321901,
      game_id: game.gameId,
      transactions: [{ action_id: bet.action_id, tx_id: expect.any(String) }],
    });

    response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions: [rollback],
        finished: true,
      }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74322001,
      game_id: game.gameId,
      transactions: [
        { action_id: rollback.action_id, tx_id: expect.any(String) },
      ],
    });
  });

  it("H. Duplicate bet id across calls (idempotency)", async () => {
    const user = await fixtures.given.user(74322151, "USD");
    const game = fixtures.given.game("acceptance:test");
    const actions = [
      fixtures.given.action.bet(100),
      fixtures.given.action.bet(50),
    ];

    let response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions: [actions[0]] }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74322051,
      game_id: game.gameId,
      transactions: [
        { action_id: actions[0]?.action_id, tx_id: expect.any(String) },
      ],
    });

    response = await fixtures.when.process(
      fixtures.given.signedRequest({ user, game, actions }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74322001,
      game_id: game.gameId,
      transactions: [
        { action_id: actions[0]?.action_id, tx_id: expect.any(String) },
        { action_id: actions[1]?.action_id, tx_id: expect.any(String) },
      ],
    });
  });

  it("I. Rollback arrives before the bet", async () => {
    const user = await fixtures.given.user(74321821, "USD");
    const game = fixtures.given.game("acceptance:test");
    const bet = fixtures.given.action.bet(100);
    const rollback = fixtures.given.action.rollback(bet.action_id);

    let response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions: [rollback],
        finished: true,
      }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74321821,
      game_id: game.gameId,
      transactions: [
        { action_id: rollback.action_id, tx_id: expect.any(String) },
      ],
    });

    response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions: [bet],
        finished: true,
      }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74321821,
      game_id: game.gameId,
      transactions: [{ action_id: bet.action_id, tx_id: expect.any(String) }],
    });
  });

  it("J. Rollbacks for bet and win arrive before either exists", async () => {
    const user = await fixtures.given.user(74321821, "USD");
    const game = fixtures.given.game("acceptance:test");
    const bet = fixtures.given.action.bet(100);
    const win = fixtures.given.action.win(200);
    const rollbackBet = fixtures.given.action.rollback(bet.action_id);
    const rollbackWin = fixtures.given.action.rollback(win.action_id);

    let response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions: [rollbackBet, rollbackWin],
        finished: true,
      }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74321821,
      game_id: game.gameId,
      transactions: [
        { action_id: rollbackBet.action_id, tx_id: expect.any(String) },
        { action_id: rollbackWin.action_id, tx_id: expect.any(String) },
      ],
    });

    response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions: [bet, win],
        finished: true,
      }),
    );

    await fixtures.then.succeeded(response, {
      balance: 74321821,
      game_id: game.gameId,
      transactions: [
        { action_id: bet.action_id, tx_id: expect.any(String) },
        { action_id: win.action_id, tx_id: expect.any(String) },
      ],
    });
  });
});

async function getFixtures() {
  let uuidSequence = 0;

  const nextRandomUUID = () =>
    createDeterministicKey(["acceptance-test", String(uuidSequence++)]);

  const database = new Pool({
    connectionString:
      process.env.BET_PROCESSOR_DATABASE_URL ??
      "postgresql://postgres:development-db-password@localhost:5432/bet_processor",
  });

  const apiUrl =
    process.env.BET_PROCESSOR_ACCEPTANCE_API_URL ?? "http://localhost:3000";

  const hmacSecret =
    process.env.BET_PROCESSOR_HMAC_SECRET ?? "development-hmac-secret";

  async function cleanup() {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM transactions");
      await client.query("DELETE FROM hot_game_action");
      await client.query("DELETE FROM game_round");
      await client.query("DELETE FROM wallet");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  try {
    await cleanup();
  } catch (error) {
    await database.end();
    throw error;
  }

  return {
    given: {
      async user(balance: number, currency: string) {
        const userId = nextRandomUUID();
        const createdAt = new Date();
        await database.query(
          `INSERT INTO wallet (id, balance, created_at, updated_at)
           VALUES ($1, $2, $3, $3)`,
          [
            createDeterministicKey(["wallet", userId, currency]),
            balance,
            createdAt,
          ],
        );

        return { userId, currency };
      },

      game(name: string) {
        return { gameId: nextRandomUUID(), name };
      },

      action: {
        bet(amount: number) {
          return { action: "bet", action_id: nextRandomUUID(), amount };
        },
        win(amount: number) {
          return { action: "win", action_id: nextRandomUUID(), amount };
        },
        rollback(original_action_id: string) {
          return {
            action: "rollback",
            action_id: nextRandomUUID(),
            original_action_id,
          };
        },
      },

      unsignedRequest(body: unknown): RequestInit {
        return {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        };
      },

      signedRequest(body: {
        user: { userId: string; currency: string };
        game: { name: string; gameId: string };
        actions?: unknown[];
        finished?: boolean;
      }): RequestInit {
        const serializedBody = JSON.stringify({
          user_id: body.user.userId,
          currency: body.user.currency,
          game: body.game.name,
          game_id: body.game.gameId,
          actions: body.actions,
          finished: body.finished,
        });

        return {
          method: "POST",
          headers: {
            authorization: `HMAC-SHA256 ${createHmacSha256Digest(
              serializedBody,
              hmacSecret,
            )}`,
            "content-type": "application/json",
          },
          body: serializedBody,
        };
      },
    },

    when: {
      async process(request: RequestInit) {
        return await fetch(
          new URL("/aggregator/takehome/process", apiUrl),
          request,
        );
      },
    },

    then: {
      async succeeded(response: Response, expected: unknown) {
        const body = ProcessorResponseSchema.parse(await response.json());

        expect(response.status).toEqual(200);
        expect(body).toEqual(expected);
      },

      async errored(response: Response, expected: unknown) {
        const body = ErrorResponseSchema.parse(await response.json());

        expect(response.status).toEqual(400);
        expect(body).toEqual(expected);
      },
    },

    async dispose() {
      await database.end();
    },
  };
}
