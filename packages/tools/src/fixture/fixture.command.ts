import { randomUUID } from "node:crypto";

import type { Command } from "commander";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import { userIdPrefix } from "../identifiers";
import { parseFixtureConfig, type FixtureConfig } from "./fixture.config";

type FixtureOptions = Parameters<typeof parseFixtureConfig>[0];

const ADVISORY_LOCK_ID = 1_770_925_114;
const BET_AMOUNT = 100;
const HOT_DATA_DAYS = 60;
const WIN_AMOUNT = 95;

export function registerFixtureCommand(program: Command): void {
  const command = program
    .command("fixture")
    .description("clean and generate benchmark database fixtures")
    .option("--batch-games <count>", "games inserted per transaction")
    .option("--clean", "delete all application data before generating")
    .option("--currency <currency>", "fixture currency")
    .option("--database-url <url>", "PostgreSQL connection URL")
    .option("--days <count>", "number of historical days")
    .option("--games <count>", "number of completed games")
    .option("--namespace <value>", "seeded user namespace")
    .option("--users <count>", "number of fixture users");

  command.action(async (options: FixtureOptions) => {
    let config: FixtureConfig;
    try {
      config = parseFixtureConfig(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        command.error(z.prettifyError(error));
      }
      throw error;
    }

    await runFixture(config);
  });
}

export async function runFixture(config: FixtureConfig): Promise<void> {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);
    await client.query("SET TIME ZONE 'UTC'");

    if (config.clean) {
      console.error("Cleaning application data...");
      await cleanApplicationData(client);
    }

    if (config.gameCount > 0) {
      const endAt = new Date(Date.now() - 60 * 60 * 1_000);
      const startAt = new Date(endAt.getTime() - config.days * 86_400 * 1_000);

      await client.query("SET synchronous_commit = OFF");

      try {
        await insertFixture(client, config, startAt, endAt);
      } finally {
        await client.query("RESET synchronous_commit");
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

async function cleanApplicationData(client: PoolClient): Promise<void> {
  console.error("Truncating ledger...");
  await client.query("TRUNCATE TABLE transactions");

  console.error("Truncating hot path tables...");
  await client.query("TRUNCATE TABLE hot_game_action, game_round, wallet");

  console.error("Clean complete.");
}

async function insertFixture(
  client: PoolClient,
  config: FixtureConfig,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const runId = randomUUID();
  const hotCutoff = new Date(endAt.getTime() - HOT_DATA_DAYS * 86_400 * 1_000);
  const prefix = userIdPrefix(config.namespace);
  const startedAt = performance.now();
  let lastLoggedAt = startedAt;

  for (let game = 1; game <= config.gameCount; ) {
    const lastGame = Math.min(game + config.batchGames - 1, config.gameCount);

    await client.query(
      String.raw`
WITH fixture_games AS MATERIALIZED (
  SELECT
    game_number,
    md5($1 || ':game:' || game_number::text)::uuid AS game_round_id,
    $1 || '-round-' || game_number::text AS game_id,
    $7 || (((game_number - 1) % $8) + 1)::text AS user_id,
    $5::timestamptz +
      (($6::timestamptz - $5::timestamptz) *
        ((game_number - 1)::double precision / GREATEST($4 - 1, 1)))
      AS created_at
  FROM generate_series($2::bigint, $3::bigint) AS game_number
),
fixture_actions AS MATERIALIZED (
  SELECT
    fixture_games.*,
    'bet' AS action_name,
    1::smallint AS action_type,
    ${String(BET_AMOUNT)}::bigint AS amount
  FROM fixture_games

  UNION ALL

  SELECT
    fixture_games.*,
    'win' AS action_name,
    2::smallint AS action_type,
    ${String(WIN_AMOUNT)}::bigint AS amount
  FROM fixture_games
),
inserted_game_rounds AS (
  INSERT INTO game_round (id, started_at, finished_at)
  SELECT game_round_id, created_at, created_at
  FROM fixture_games
),
inserted_transactions AS (
  INSERT INTO transactions (
    created_at, tx_id, action_id, user_id, currency,
    game_name, game_id, action_type, bet_delta, win_delta,
    game_event_flags, rollback_of_action_id
  )
  SELECT
    created_at,
    md5($1 || ':tx:' || game_number::text || ':' || action_name)::uuid,
    md5($1 || ':external-action:' || game_number::text || ':' || action_name)::uuid,
    user_id,
    $10,
    'fixture',
    game_id,
    action_type,
    CASE WHEN action_type = 1 THEN amount ELSE 0 END,
    CASE WHEN action_type = 2 THEN amount ELSE 0 END,
    CASE WHEN action_type = 1 THEN 1 ELSE 2 END,
    NULL
  FROM fixture_actions
)
INSERT INTO hot_game_action (
  id, game_round_id, action_type, amount,
  rollback_of_game_action_id, created_at
)
SELECT
  md5($1 || ':action:' || game_number::text || ':' || action_name)::uuid,
  game_round_id,
  action_type,
  amount,
  NULL,
  created_at
FROM fixture_actions
WHERE created_at >= $9::timestamptz
`,
      [
        runId,
        game,
        lastGame,
        config.gameCount,
        startAt,
        endAt,
        prefix,
        config.playerCount,
        hotCutoff,
        config.currency,
      ],
    );

    const now = performance.now();
    if (lastGame === config.gameCount || now - lastLoggedAt >= 5_000) {
      const elapsedSeconds = (now - startedAt) / 1_000;
      const gamesPerSecond =
        elapsedSeconds === 0 ? 0 : Math.round(lastGame / elapsedSeconds);
      console.error(
        `Inserted ${lastGame.toLocaleString("en-US")}/${config.gameCount.toLocaleString("en-US")} games (~${gamesPerSecond.toLocaleString("en-US")} games/s)...`,
      );
      lastLoggedAt = now;
    }

    game = lastGame + 1;
  }
}
