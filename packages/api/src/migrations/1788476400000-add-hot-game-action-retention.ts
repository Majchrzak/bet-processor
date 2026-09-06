import type { MigrationInterface, QueryRunner } from "typeorm";

const sql = String.raw;

export class AddHotGameActionRetention1788476400000
  implements MigrationInterface
{
  readonly name = "AddHotGameActionRetention1788476400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql`
      CREATE PROCEDURE cleanup_expired_game_actions(
        job_id INTEGER,
        config JSONB
      )
      LANGUAGE plpgsql AS $procedure$
      DECLARE
        retention_days INTEGER :=
          COALESCE((config->>'retention_days')::INTEGER, 60);
        max_games INTEGER :=
          COALESCE((config->>'max_games')::INTEGER, 5000000);
      BEGIN
        IF retention_days < 1 OR max_games < 1 THEN
          RAISE EXCEPTION 'retention_days and max_games must be positive';
        END IF;

        WITH expired_games AS MATERIALIZED (
          SELECT game_round.id
          FROM (
            SELECT game_round_id, MAX(created_at) AS last_activity_at
            FROM hot_game_action
            GROUP BY game_round_id
          ) AS hot_game
          JOIN game_round ON game_round.id = hot_game.game_round_id
          WHERE (
              game_round.finished_at IS NOT NULL
              AND game_round.finished_at <=
                now() - make_interval(days => retention_days)
            )
            OR (
              game_round.finished_at IS NULL
              AND hot_game.last_activity_at <=
                now() - make_interval(days => retention_days)
            )
          LIMIT max_games
          FOR UPDATE OF game_round SKIP LOCKED
        )
        DELETE FROM hot_game_action
        USING expired_games
        WHERE hot_game_action.game_round_id = expired_games.id;
      END
      $procedure$
    `);

    await queryRunner.query(sql`
      SELECT add_job(
        'cleanup_expired_game_actions',
        INTERVAL '1 day',
        config => '{"retention_days":60,"max_games":5000000}'::JSONB,
        initial_start =>
          '2026-01-01 03:00:00 Europe/Warsaw'::TIMESTAMPTZ,
        fixed_schedule => TRUE,
        timezone => 'Europe/Warsaw',
        job_name => 'Cleanup expired game actions'
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql`
      SELECT delete_job(job_id)
      FROM timescaledb_information.jobs
      WHERE proc_schema = 'public'
        AND proc_name = 'cleanup_expired_game_actions'
    `);

    await queryRunner.query(sql`
      DROP PROCEDURE cleanup_expired_game_actions(INTEGER, JSONB)
    `);
  }
}
