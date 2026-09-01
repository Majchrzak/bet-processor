import type { MigrationInterface, QueryRunner } from "typeorm";

const sql = String.raw;

/**
 * Creates the permanent ledger and its deliberately small set of operational
 * projections. Identifiers are UUIDv8 values derived by the application from
 * the natural keys documented beside each table.
 */
export class AddGameTables1788217200000 implements MigrationInterface {
  readonly name = "AddGameTables1788217200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql`
      CREATE EXTENSION IF NOT EXISTS timescaledb
    `);

    // id = deterministic key(user_id, currency)
    await queryRunner.query(sql`
      CREATE TABLE wallet (
        id          UUID PRIMARY KEY,
        balance     BIGINT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL,

        CONSTRAINT "CK_wallet_balance"
          CHECK (balance >= 0),
        CONSTRAINT "CK_wallet_timestamps"
          CHECK (updated_at >= created_at)
      )
    `);

    // id = deterministic key(wallet_id, game_name, game_id)
    await queryRunner.query(sql`
      CREATE TABLE game_round (
        id          UUID PRIMARY KEY,
        started_at  TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ,

        CONSTRAINT "CK_game_round_lifecycle"
          CHECK (finished_at IS NULL OR finished_at >= started_at)
      )
    `);

    // id = deterministic key(wallet_id, game_name, game_id, action_id)
    await queryRunner.query(sql`
      CREATE TABLE hot_game_action (
        id                         UUID PRIMARY KEY,
        game_round_id              UUID NOT NULL,
        action_type                SMALLINT NOT NULL,
        amount                     BIGINT NOT NULL DEFAULT 0,
        rollback_of_game_action_id UUID,
        created_at                 TIMESTAMPTZ NOT NULL,

        CONSTRAINT "CK_hot_game_action_amount"
          CHECK (amount >= 0),
        CONSTRAINT "CK_hot_game_action_rollback"
          CHECK (
            (action_type = 3 AND rollback_of_game_action_id IS NOT NULL)
            OR
            (action_type IN (1, 2) AND rollback_of_game_action_id IS NULL)
          )
      )
    `);

    // Supports rollback lookup; later rollback actions remain valid no-ops.
    await queryRunner.query(sql`
      CREATE INDEX "IDX_hot_game_action_rollback"
      ON hot_game_action (rollback_of_game_action_id)
      WHERE rollback_of_game_action_id IS NOT NULL
    `);

    /*
     * Permanent, append-only financial ledger.
     * action_type: bet=1, win=2, rollback=3.
     * game_event_flags is a bit mask: STARTED=1, FINISHED=2.
     */
    await queryRunner.query(sql`
      CREATE TABLE transactions (
        created_at            TIMESTAMPTZ NOT NULL,
        tx_id                 UUID NOT NULL,
        action_id             UUID NOT NULL,
        user_id               TEXT NOT NULL,
        currency              TEXT NOT NULL,
        game_name             TEXT,
        game_id               TEXT,
        action_type           SMALLINT NOT NULL,
        bet_delta             BIGINT NOT NULL DEFAULT 0,
        win_delta             BIGINT NOT NULL DEFAULT 0,
        game_event_flags      SMALLINT NOT NULL DEFAULT 0,
        rollback_of_action_id UUID,

        CONSTRAINT "CK_transactions_deltas"
          CHECK (
            (action_type = 1 AND bet_delta >= 0 AND win_delta = 0)
            OR
            (action_type = 2 AND bet_delta = 0 AND win_delta >= 0)
            OR
            (
              action_type = 3
              AND (
                (bet_delta <= 0 AND win_delta = 0)
                OR (bet_delta = 0 AND win_delta <= 0)
              )
            )
          ),
        CONSTRAINT "CK_transactions_game"
          CHECK (
            game_name IS NOT NULL
            AND game_name <> ''
            AND game_id IS NOT NULL
            AND game_id <> ''
          ),
        CONSTRAINT "CK_transactions_rollback"
          CHECK (
            (action_type = 3 AND rollback_of_action_id IS NOT NULL)
            OR
            (action_type <> 3 AND rollback_of_action_id IS NULL)
          ),
        CONSTRAINT "CK_transactions_game_event_flags"
          CHECK (game_event_flags BETWEEN 0 AND 3)
      )
    `);

    await queryRunner.query(sql`
      SELECT create_hypertable(
        'transactions',
        'created_at',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql`DROP TABLE IF EXISTS transactions`);
    await queryRunner.query(sql`DROP TABLE IF EXISTS hot_game_action`);
    await queryRunner.query(sql`DROP TABLE IF EXISTS game_round`);
    await queryRunner.query(sql`DROP TABLE IF EXISTS wallet`);
  }
}
