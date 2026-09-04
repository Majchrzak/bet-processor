/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { getAcceptanceFixtures } from "./support/acceptance-fixtures";

describe("bet processor HTTP integration", () => {
  let fixtures: Awaited<ReturnType<typeof getAcceptanceFixtures>>;

  beforeAll(async () => {
    fixtures = await getAcceptanceFixtures();
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
