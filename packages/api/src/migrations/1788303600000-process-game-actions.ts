import type { MigrationInterface, QueryRunner } from "typeorm";

const sql = String.raw;

export const processGameActionsSql = sql`
  CREATE OR REPLACE FUNCTION process_game_actions(
    p_user_id TEXT, p_currency TEXT, p_wallet_id UUID,
    p_game_name TEXT, p_game_id TEXT, p_game_round_id UUID,
    p_finished BOOLEAN, p_actions JSONB, p_processed_at TIMESTAMPTZ
  )
  RETURNS TABLE (balance BIGINT, transactions JSONB)
  LANGUAGE plpgsql AS $function$
  DECLARE
    v_action RECORD;
    v_action_type SMALLINT;
    v_bet_delta BIGINT;
    v_win_delta BIGINT;
    v_game_event_flags SMALLINT;
    v_balance BIGINT;
    v_finish_event BOOLEAN;
    v_game_finished BOOLEAN;
    v_game_needs_finish BOOLEAN;
    v_pre_rolled_back BOOLEAN;
    v_transactions JSONB := '[]'::jsonb;
  BEGIN
    -- Serialize every balance change made by this batch.
    SELECT wallet.balance INTO v_balance
    FROM wallet
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'BP001', MESSAGE = 'Wallet not found';
    END IF;

    -- Create the durable round or lock its existing lifecycle state.
    INSERT INTO game_round (id, started_at, finished_at)
    VALUES (
      p_game_round_id,
      p_processed_at,
      CASE WHEN p_finished THEN p_processed_at END
    )
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
      v_game_event_flags := 1;
      v_finish_event := p_finished;
      v_game_finished := FALSE;
      v_game_needs_finish := FALSE;
    ELSE
      v_game_event_flags := 0;
      SELECT finished_at IS NOT NULL
      INTO v_game_finished
      FROM game_round
      WHERE id = p_game_round_id
      FOR KEY SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Game not found after insert conflict';
      END IF;

      v_finish_event := p_finished AND NOT v_game_finished;
      v_game_needs_finish := v_finish_event;
    END IF;

    -- jsonb_to_recordset plus ordinality preserves the request action order.
    FOR v_action IN
      SELECT action_name, action_id, action_key, amount,
        original_action_id, original_action_key
      FROM ROWS FROM (jsonb_to_recordset(p_actions) AS (
        action TEXT, action_id UUID, action_key UUID, amount BIGINT,
        original_action_id UUID, original_action_key UUID
      )) WITH ORDINALITY AS input(
        action_name, action_id, action_key, amount,
        original_action_id, original_action_key, ordinal
      )
      ORDER BY ordinal
    LOOP
      -- Replays remain idempotent after the game is finished.
      IF EXISTS (
        SELECT FROM hot_game_action WHERE id = v_action.action_key
      ) THEN
        v_game_event_flags := 0;
        v_transactions := v_transactions || jsonb_build_array(
          jsonb_build_object(
            'action_id', v_action.action_id::text,
            'tx_id', v_action.action_key::text
          )
        );
        CONTINUE;
      END IF;

      -- A pre-rolled-back original is the only new action accepted after finish.
      v_pre_rolled_back := FALSE;
      IF v_action.action_name IN ('bet', 'win') THEN
        v_pre_rolled_back := EXISTS (
          SELECT FROM hot_game_action
          WHERE rollback_of_game_action_id = v_action.action_key
        );
      END IF;

      IF v_game_finished AND NOT v_pre_rolled_back THEN
        RAISE EXCEPTION USING ERRCODE = 'BP003',
          MESSAGE = 'Game is already finished';
      END IF;

      v_bet_delta := 0;
      v_win_delta := 0;

      IF v_action.action_name = 'rollback' THEN
        v_action_type := 3;

        -- Only the first rollback can reverse an existing original action.
        IF NOT EXISTS (
          SELECT FROM hot_game_action
          WHERE rollback_of_game_action_id = v_action.original_action_key
        ) THEN
          SELECT
            CASE action_type WHEN 1 THEN -amount ELSE 0 END,
            CASE action_type WHEN 2 THEN -amount ELSE 0 END
          INTO v_bet_delta, v_win_delta
          FROM hot_game_action
          WHERE id = v_action.original_action_key
            AND action_type IN (1, 2);

          IF NOT FOUND THEN
            v_bet_delta := 0;
            v_win_delta := 0;
          END IF;
        END IF;
      ELSIF v_action.action_name IN ('bet', 'win') THEN
        v_action_type := CASE v_action.action_name WHEN 'bet' THEN 1 ELSE 2 END;

        -- An original received after its rollback is a permanent no-op.
        IF NOT v_pre_rolled_back THEN
          v_bet_delta := CASE WHEN v_action_type = 1 THEN v_action.amount ELSE 0 END;
          v_win_delta := CASE WHEN v_action_type = 2 THEN v_action.amount ELSE 0 END;
        END IF;
      ELSE
        RAISE EXCEPTION 'Unsupported action type: %', v_action.action_name;
      END IF;

      v_balance := v_balance + v_win_delta - v_bet_delta;
      IF v_balance < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'BP002',
          MESSAGE = 'Player has not enough funds to process an action';
      END IF;

      INSERT INTO hot_game_action (
        id, game_round_id, action_type, amount,
        rollback_of_game_action_id, created_at
      ) VALUES (
        v_action.action_key, p_game_round_id, v_action_type,
        CASE v_action_type
          WHEN 1 THEN v_bet_delta
          WHEN 2 THEN v_win_delta
          ELSE 0
        END,
        v_action.original_action_key, p_processed_at
      );

      INSERT INTO transactions (
        created_at, tx_id, action_id, user_id, currency,
        game_name, game_id, action_type, bet_delta, win_delta,
        game_event_flags, rollback_of_action_id
      ) VALUES (
        p_processed_at, v_action.action_key, v_action.action_id,
        p_user_id, p_currency, p_game_name, p_game_id, v_action_type,
        v_bet_delta, v_win_delta,
        v_game_event_flags | CASE WHEN v_finish_event THEN 2 ELSE 0 END,
        v_action.original_action_id
      );

      v_game_event_flags := 0;
      v_finish_event := FALSE;
      v_transactions := v_transactions || jsonb_build_array(
        jsonb_build_object(
          'action_id', v_action.action_id::text,
          'tx_id', v_action.action_key::text
        )
      );
    END LOOP;

    UPDATE wallet
    SET balance = v_balance, updated_at = p_processed_at
    WHERE id = p_wallet_id;

    IF v_game_needs_finish THEN
      UPDATE game_round
      SET finished_at = p_processed_at
      WHERE id = p_game_round_id;
    END IF;

    RETURN QUERY SELECT v_balance, v_transactions;
  END $function$
`;

export class ProcessGameActions1788303600000 implements MigrationInterface {
  readonly name = "ProcessGameActions1788303600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(processGameActionsSql);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql`
      DROP FUNCTION IF EXISTS process_game_actions(
        TEXT, TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, JSONB, TIMESTAMPTZ
      )
    `);
  }
}
