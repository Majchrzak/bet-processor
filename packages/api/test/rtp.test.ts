import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getFixtures } from "./fixtures";

describe("RTP report HTTP integration", () => {
  let fixtures: Awaited<ReturnType<typeof getFixtures>>;
  let window: { from: string; to: string };
  let users: {
    rolledBack: { userId: string; currency: string };
    regular: { userId: string; currency: string };
    zeroBet: { userId: string; currency: string };
  };

  beforeAll(async () => {
    fixtures = await getFixtures();

    users = {
      rolledBack: await fixtures.given.user(1_000, "USD"),
      regular: await fixtures.given.user(1_000, "USD"),
      zeroBet: await fixtures.given.user(1_000, "EUR"),
    };

    await fixtures.when.process(
      fixtures.given.signedRequest({
        user: users.rolledBack,
        game: fixtures.given.game("acceptance:rtp"),
        actions: [
          fixtures.given.action.bet(100),
          fixtures.given.action.win(80),
        ],
        finished: true,
      }),
    );

    const rollbackGame = fixtures.given.game("acceptance:rtp:rollback");
    const rolledBackBet = fixtures.given.action.bet(40);
    const rolledBackWin = fixtures.given.action.win(20);
    await fixtures.when.process(
      fixtures.given.signedRequest({
        user: users.rolledBack,
        game: rollbackGame,
        actions: [rolledBackBet, rolledBackWin],
      }),
    );
    await fixtures.when.process(
      fixtures.given.signedRequest({
        user: users.rolledBack,
        game: rollbackGame,
        actions: [
          fixtures.given.action.rollback(rolledBackBet.action_id),
          fixtures.given.action.rollback(rolledBackWin.action_id),
        ],
        finished: true,
      }),
    );

    await fixtures.when.process(
      fixtures.given.signedRequest({
        user: users.regular,
        game: fixtures.given.game("acceptance:rtp"),
        actions: [
          fixtures.given.action.bet(200),
          fixtures.given.action.win(100),
        ],
        finished: true,
      }),
    );

    const zeroBetGame = fixtures.given.game("acceptance:rtp:zero-bet");
    const zeroBet = fixtures.given.action.bet(50);
    await fixtures.when.process(
      fixtures.given.signedRequest({
        user: users.zeroBet,
        game: zeroBetGame,
        actions: [zeroBet],
      }),
    );
    await fixtures.when.process(
      fixtures.given.signedRequest({
        user: users.zeroBet,
        game: zeroBetGame,
        actions: [fixtures.given.action.rollback(zeroBet.action_id)],
        finished: true,
      }),
    );

    window = await fixtures.given.timeWindow([
      users.rolledBack.userId,
      users.regular.userId,
      users.zeroBet.userId,
    ]);
  });

  afterAll(async () => {
    await fixtures.dispose();
  });

  it("A. Missing Authorization → 403", async () => {
    const response = await fixtures.when.reportCasino(window, false);

    expect(response.status).toBe(403);
  });

  it("B. Per-user RTP with rollbacks and cursor pagination", async () => {
    const data = [];
    let cursor: string | null = null;

    do {
      const response = await fixtures.when.reportUsers(window, {
        limit: "1",
        ...(cursor === null ? {} : { cursor }),
      });
      const page = await fixtures.then.userRtpReportPage(response);

      data.push(...page.data);
      cursor = page.next_cursor;
    } while (cursor !== null);

    expect(data).toEqual(
      [
        {
          user_id: users.rolledBack.userId,
          currency: "USD",
          rounds: 2,
          total_bet: 100,
          total_win: 80,
          rolled_back_bet: 40,
          rolled_back_win: 20,
          rtp: 0.8,
        },
        {
          user_id: users.regular.userId,
          currency: "USD",
          rounds: 1,
          total_bet: 200,
          total_win: 100,
          rolled_back_bet: 0,
          rolled_back_win: 0,
          rtp: 0.5,
        },
        {
          user_id: users.zeroBet.userId,
          currency: "EUR",
          rounds: 1,
          total_bet: 0,
          total_win: 0,
          rolled_back_bet: 50,
          rolled_back_win: 0,
          rtp: null,
        },
      ].sort((left, right) => left.user_id.localeCompare(right.user_id)),
    );
  });

  it("C. Casino-wide RTP per currency", async () => {
    const response = await fixtures.when.reportCasino(window);

    await fixtures.then.casinoRtpReport(response, {
      data: [
        {
          currency: "EUR",
          rounds: 1,
          total_bet: 0,
          total_win: 0,
          rolled_back_bet: 50,
          rolled_back_win: 0,
          rtp: null,
        },
        {
          currency: "USD",
          rounds: 3,
          total_bet: 300,
          total_win: 180,
          rolled_back_bet: 40,
          rolled_back_win: 20,
          rtp: 0.6,
        },
      ],
    });
  });

  it("D. Excludes transactions outside the requested window", async () => {
    const to = new Date(window.from);
    const emptyWindow = {
      from: new Date(to.getTime() - 1_000).toISOString(),
      to: to.toISOString(),
    };

    await fixtures.then.userRtpReport(
      await fixtures.when.reportUsers(emptyWindow),
      { data: [], next_cursor: null },
    );
    await fixtures.then.casinoRtpReport(
      await fixtures.when.reportCasino(emptyWindow),
      { data: [] },
    );
  });
});
