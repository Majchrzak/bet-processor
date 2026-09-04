import type { MigrationInterface, QueryRunner } from "typeorm";

const sql = String.raw;

/**
 * Adds the reporting projections and retention jobs around the permanent
 * ledger. Reports use raw rows at partial-hour edges, these hourly summaries
 * for complete hours, and the daily summaries for complete days.
 */
export class AddRtpAggregatesAndRetention1788390000000 implements MigrationInterface {
  readonly name = "AddRtpAggregatesAndRetention1788390000000";

  columnstoreRelations = [
    "transactions",
    "agg_user_rtp_hourly",
    "agg_casino_rtp_hourly",
    "agg_user_rtp_daily",
    "agg_casino_rtp_daily",
  ] as const;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql`
      CREATE MATERIALIZED VIEW agg_user_rtp_hourly
      WITH (
        timescaledb.continuous,
        timescaledb.materialized_only = FALSE,
        timescaledb.create_group_indexes = FALSE
      ) AS
      SELECT
        time_bucket(INTERVAL '1 hour', created_at) AS bucket,
        user_id,
        currency,
        SUM(game_event_flags & 1)::BIGINT AS rounds,
        SUM(bet_delta)::BIGINT AS total_bet,
        SUM(win_delta)::BIGINT AS total_win,
        SUM(CASE WHEN bet_delta < 0 THEN -bet_delta ELSE 0 END)::BIGINT
          AS rolled_back_bet,
        SUM(CASE WHEN win_delta < 0 THEN -win_delta ELSE 0 END)::BIGINT
          AS rolled_back_win
      FROM transactions
      GROUP BY 1, 2, 3
      WITH NO DATA
    `);

    await queryRunner.query(sql`
      CREATE INDEX "IDX_agg_user_rtp_hourly_user_currency_bucket"
      ON agg_user_rtp_hourly (user_id, currency, bucket)
    `);

    await queryRunner.query(sql`
      CREATE MATERIALIZED VIEW agg_casino_rtp_hourly
      WITH (
        timescaledb.continuous,
        timescaledb.materialized_only = FALSE,
        timescaledb.create_group_indexes = FALSE
      ) AS
      SELECT
        time_bucket(INTERVAL '1 hour', created_at) AS bucket,
        currency,
        SUM(game_event_flags & 1)::BIGINT AS rounds,
        SUM(bet_delta)::BIGINT AS total_bet,
        SUM(win_delta)::BIGINT AS total_win,
        SUM(CASE WHEN bet_delta < 0 THEN -bet_delta ELSE 0 END)::BIGINT
          AS rolled_back_bet,
        SUM(CASE WHEN win_delta < 0 THEN -win_delta ELSE 0 END)::BIGINT
          AS rolled_back_win
      FROM transactions
      GROUP BY 1, 2
      WITH NO DATA
    `);

    await queryRunner.query(sql`
      CREATE INDEX "IDX_agg_casino_rtp_hourly_currency_bucket"
      ON agg_casino_rtp_hourly (currency, bucket)
    `);

    for (const aggregate of ["agg_user_rtp_hourly", "agg_casino_rtp_hourly"]) {
      await queryRunner.query(sql`
        SELECT add_continuous_aggregate_policy(
          '${aggregate}',
          start_offset => INTERVAL '1 month',
          end_offset => INTERVAL '1 hour',
          schedule_interval => INTERVAL '15 minutes'
        )
      `);
    }

    await queryRunner.query(sql`
      CREATE MATERIALIZED VIEW agg_user_rtp_daily
      WITH (
        timescaledb.continuous,
        timescaledb.materialized_only = FALSE,
        timescaledb.create_group_indexes = FALSE
      ) AS
      SELECT
        time_bucket(INTERVAL '1 day', bucket) AS bucket,
        user_id,
        currency,
        SUM(rounds)::BIGINT AS rounds,
        SUM(total_bet)::BIGINT AS total_bet,
        SUM(total_win)::BIGINT AS total_win,
        SUM(rolled_back_bet)::BIGINT AS rolled_back_bet,
        SUM(rolled_back_win)::BIGINT AS rolled_back_win
      FROM agg_user_rtp_hourly
      GROUP BY 1, 2, 3
      WITH NO DATA
    `);

    await queryRunner.query(sql`
      CREATE INDEX "IDX_agg_user_rtp_daily_user_currency_bucket"
      ON agg_user_rtp_daily (user_id, currency, bucket)
    `);

    await queryRunner.query(sql`
      CREATE MATERIALIZED VIEW agg_casino_rtp_daily
      WITH (
        timescaledb.continuous,
        timescaledb.materialized_only = FALSE,
        timescaledb.create_group_indexes = FALSE
      ) AS
      SELECT
        time_bucket(INTERVAL '1 day', bucket) AS bucket,
        currency,
        SUM(rounds)::BIGINT AS rounds,
        SUM(total_bet)::BIGINT AS total_bet,
        SUM(total_win)::BIGINT AS total_win,
        SUM(rolled_back_bet)::BIGINT AS rolled_back_bet,
        SUM(rolled_back_win)::BIGINT AS rolled_back_win
      FROM agg_casino_rtp_hourly
      GROUP BY 1, 2
      WITH NO DATA
    `);

    await queryRunner.query(sql`
      CREATE INDEX "IDX_agg_casino_rtp_daily_currency_bucket"
      ON agg_casino_rtp_daily (currency, bucket)
    `);

    for (const aggregate of ["agg_user_rtp_daily", "agg_casino_rtp_daily"]) {
      await queryRunner.query(sql`
        SELECT add_continuous_aggregate_policy(
          '${aggregate}',
          start_offset => INTERVAL '1 month',
          end_offset => INTERVAL '1 day',
          schedule_interval => INTERVAL '1 hour'
        )
      `);
    }

    await queryRunner.query(sql`
      ALTER TABLE transactions SET (
        timescaledb.enable_columnstore = TRUE,
        timescaledb.segmentby = 'currency',
        timescaledb.orderby = 'created_at DESC, user_id'
      )
    `);

    await queryRunner.query(sql`
      ALTER MATERIALIZED VIEW agg_user_rtp_hourly SET (
        timescaledb.enable_columnstore = TRUE,
        timescaledb.segmentby = 'currency',
        timescaledb.orderby = 'bucket DESC, user_id'
      )
    `);

    await queryRunner.query(sql`
      ALTER MATERIALIZED VIEW agg_casino_rtp_hourly SET (
        timescaledb.enable_columnstore = TRUE,
        timescaledb.segmentby = 'currency',
        timescaledb.orderby = 'bucket DESC'
      )
    `);

    await queryRunner.query(sql`
      ALTER MATERIALIZED VIEW agg_user_rtp_daily SET (
        timescaledb.enable_columnstore = TRUE,
        timescaledb.segmentby = 'currency',
        timescaledb.orderby = 'bucket DESC, user_id'
      )
    `);

    await queryRunner.query(sql`
      ALTER MATERIALIZED VIEW agg_casino_rtp_daily SET (
        timescaledb.enable_columnstore = TRUE,
        timescaledb.segmentby = 'currency',
        timescaledb.orderby = 'bucket DESC'
      )
    `);

    for (const relation of this.columnstoreRelations) {
      await queryRunner.query(sql`
        CALL add_columnstore_policy(
          '${relation}',
          after => INTERVAL '45 days',
          if_not_exists => TRUE
        )
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const relation of this.columnstoreRelations) {
      await queryRunner.query(sql`
        CALL remove_columnstore_policy('${relation}', if_exists => TRUE)
      `);
    }

    await queryRunner.query(sql`
      DO $block$
      DECLARE
        v_chunk REGCLASS;
      BEGIN
        FOR v_chunk IN SELECT show_chunks('transactions'::REGCLASS)
        LOOP
          CALL convert_to_rowstore(v_chunk, if_columnstore => TRUE);
        END LOOP;
      END
      $block$
    `);

    await queryRunner.query(sql`
      ALTER TABLE transactions SET (timescaledb.enable_columnstore = FALSE)
    `);

    await queryRunner.query(sql`
      DROP MATERIALIZED VIEW IF EXISTS agg_casino_rtp_daily
    `);
    await queryRunner.query(sql`
      DROP MATERIALIZED VIEW IF EXISTS agg_user_rtp_daily
    `);
    await queryRunner.query(sql`
      DROP MATERIALIZED VIEW IF EXISTS agg_casino_rtp_hourly
    `);
    await queryRunner.query(sql`
      DROP MATERIALIZED VIEW IF EXISTS agg_user_rtp_hourly
    `);
  }
}
