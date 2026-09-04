import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CasinoRtpReportResponseSchema } from "../src/rtp-casino/contract/rtp-casino.response";
import { UserRtpReportResponseSchema } from "../src/rtp-users/contract/rtp-users.response";
import { getAcceptanceFixtures } from "./support/acceptance-fixtures";

describe("RTP report HTTP integration", () => {
  let fixtures: Awaited<ReturnType<typeof getAcceptanceFixtures>>;
  let window: { from: string; to: string };
  let users: {
    rolledBack: { userId: string; currency: string };
    regular: { userId: string; currency: string };
    zeroBet: { userId: string; currency: string };
  };

  beforeAll(async () => {
    fixtures = await getAcceptanceFixtures();

    users = {
      rolledBack: await fixtures.given.user(1_000, "USD"),
      regular: await fixtures.given.user(1_000, "USD"),
      zeroBet: await fixtures.given.user(1_000, "EUR"),
    };

    await processRound(users.rolledBack, [
      fixtures.given.action.bet(100),
      fixtures.given.action.win(80),
    ]);

    const rolledBackBet = fixtures.given.action.bet(40);
    const rolledBackWin = fixtures.given.action.win(20);
    const rollbackGame = fixtures.given.game("acceptance:rtp:rollback");
    await process(users.rolledBack, rollbackGame, [
      rolledBackBet,
      rolledBackWin,
    ]);
    await process(
      users.rolledBack,
      rollbackGame,
      [
        fixtures.given.action.rollback(rolledBackBet.action_id),
        fixtures.given.action.rollback(rolledBackWin.action_id),
      ],
      true,
    );

    await processRound(users.regular, [
      fixtures.given.action.bet(200),
      fixtures.given.action.win(100),
    ]);

    const zeroBet = fixtures.given.action.bet(50);
    const zeroBetGame = fixtures.given.game("acceptance:rtp:zero-bet");
    await process(users.zeroBet, zeroBetGame, [zeroBet]);
    await process(
      users.zeroBet,
      zeroBetGame,
      [fixtures.given.action.rollback(zeroBet.action_id)],
      true,
    );

    const timestamps = await fixtures.database.query<{
      earliest: Date;
      latest: Date;
    }>(
      `SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest
       FROM transactions
       WHERE user_id = ANY($1::TEXT[])`,
      [[users.rolledBack.userId, users.regular.userId, users.zeroBet.userId]],
    );
    const bounds = timestamps.rows[0];
    if (!bounds) throw new Error("RTP acceptance transactions are missing");

    window = {
      from: new Date(bounds.earliest.getTime() - 1).toISOString(),
      to: new Date(bounds.latest.getTime() + 1).toISOString(),
    };
  });

  afterAll(async () => {
    await fixtures.dispose();
  });

  it("reports per-user RTP with rollbacks and cursor pagination", async () => {
    const data = [];
    let cursor: string | null = null;

    do {
      const query = new URLSearchParams({ ...window, limit: "1" });
      if (cursor !== null) query.set("cursor", cursor);

      const response = await fixtures.when.report(
        `/reports/rtp/users?${query.toString()}`,
      );
      expect(response.status).toBe(200);

      const page = UserRtpReportResponseSchema.parse(await response.json());
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

  it("reports casino-wide RTP per currency", async () => {
    const response = await fixtures.when.report(
      `/reports/rtp/casino?${new URLSearchParams(window).toString()}`,
    );
    expect(response.status).toBe(200);

    const report = CasinoRtpReportResponseSchema.parse(await response.json());
    expect(report.data).toEqual([
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
    ]);
  });

  it("excludes transactions outside the requested window", async () => {
    const to = new Date(window.from);
    const query = new URLSearchParams({
      from: new Date(to.getTime() - 1_000).toISOString(),
      to: to.toISOString(),
    });

    const userResponse = await fixtures.when.report(
      `/reports/rtp/users?${query.toString()}`,
    );
    const casinoResponse = await fixtures.when.report(
      `/reports/rtp/casino?${query.toString()}`,
    );

    expect(userResponse.status).toBe(200);
    expect(
      UserRtpReportResponseSchema.parse(await userResponse.json()),
    ).toEqual({ data: [], next_cursor: null });
    expect(casinoResponse.status).toBe(200);
    expect(
      CasinoRtpReportResponseSchema.parse(await casinoResponse.json()),
    ).toEqual({ data: [] });
  });

  it("requires authorization", async () => {
    const response = await fixtures.when.report(
      `/reports/rtp/casino?${new URLSearchParams(window).toString()}`,
      false,
    );

    expect(response.status).toBe(403);
  });

  async function processRound(
    user: { userId: string; currency: string },
    actions: unknown[],
  ) {
    await process(
      user,
      fixtures.given.game("acceptance:rtp"),
      actions,
      true,
    );
  }

  async function process(
    user: { userId: string; currency: string },
    game: { gameId: string; name: string },
    actions: unknown[],
    finished?: boolean,
  ) {
    const response = await fixtures.when.process(
      fixtures.given.signedRequest({
        user,
        game,
        actions,
        ...(finished === undefined ? {} : { finished }),
      }),
    );
    expect(response.status).toBe(200);
  }
});
