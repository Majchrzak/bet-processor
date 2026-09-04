import "zod/compile";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { calculateTimeBucketBounds } from "../time";

const sql = String.raw;

const CasinoRtpDatabaseRowSchema = z
  .object({
    currency: z.string().trim().min(1).max(16),
    rounds: z.string().regex(/^(?:0|[1-9]\d*)$/u),
    total_bet: z.string().regex(/^(?:0|-?[1-9]\d*)$/u),
    total_win: z.string().regex(/^(?:0|-?[1-9]\d*)$/u),
    rolled_back_bet: z.string().regex(/^(?:0|[1-9]\d*)$/u),
    rolled_back_win: z.string().regex(/^(?:0|[1-9]\d*)$/u),
  })
  .strict();

export type CasinoRtpDatabaseRow = z.infer<typeof CasinoRtpDatabaseRowSchema>;

export function createCasinoRtpRepository(dataSource: DataSource) {
  return {
    async report(window: { from: Date; to: Date }) {
      const bounds = calculateTimeBucketBounds(window);

      // Cover the [from, to) window without overlap: read partial boundary
      // hours from transactions, complete hours from the hourly aggregate,
      // and complete UTC days from the daily aggregate, then combine every
      // segment into one total per currency. The conditional bounds skip
      // aggregate levels when the requested window contains no complete bucket.
      const rows = z.array(CasinoRtpDatabaseRowSchema).parse(
        await dataSource.query(
          sql`
            WITH report_rows AS (
              SELECT
                currency,
                SUM(game_event_flags & 1)::BIGINT AS rounds,
                SUM(bet_delta)::BIGINT AS total_bet,
                SUM(win_delta)::BIGINT AS total_win,
                SUM(CASE WHEN bet_delta < 0 THEN -bet_delta ELSE 0 END)::BIGINT
                  AS rolled_back_bet,
                SUM(CASE WHEN win_delta < 0 THEN -win_delta ELSE 0 END)::BIGINT
                  AS rolled_back_win
              FROM transactions
              WHERE created_at >= $1::TIMESTAMPTZ
                AND created_at < CASE
                  WHEN $3::TIMESTAMPTZ < $4::TIMESTAMPTZ
                    THEN $3::TIMESTAMPTZ
                  ELSE $2::TIMESTAMPTZ
                END
              GROUP BY currency

              UNION ALL

              SELECT
                currency, rounds, total_bet, total_win,
                rolled_back_bet, rolled_back_win
              FROM agg_casino_rtp_hourly
              WHERE $3::TIMESTAMPTZ < $4::TIMESTAMPTZ
                AND bucket >= $3::TIMESTAMPTZ
                AND bucket < CASE
                  WHEN $5::TIMESTAMPTZ < $6::TIMESTAMPTZ
                    THEN $5::TIMESTAMPTZ
                  ELSE $4::TIMESTAMPTZ
                END

              UNION ALL

              SELECT
                currency, rounds, total_bet, total_win,
                rolled_back_bet, rolled_back_win
              FROM agg_casino_rtp_daily
              WHERE $5::TIMESTAMPTZ < $6::TIMESTAMPTZ
                AND bucket >= $5::TIMESTAMPTZ
                AND bucket < $6::TIMESTAMPTZ

              UNION ALL

              SELECT
                currency, rounds, total_bet, total_win,
                rolled_back_bet, rolled_back_win
              FROM agg_casino_rtp_hourly
              WHERE $5::TIMESTAMPTZ < $6::TIMESTAMPTZ
                AND bucket >= $6::TIMESTAMPTZ
                AND bucket < $4::TIMESTAMPTZ

              UNION ALL

              SELECT
                currency,
                SUM(game_event_flags & 1)::BIGINT AS rounds,
                SUM(bet_delta)::BIGINT AS total_bet,
                SUM(win_delta)::BIGINT AS total_win,
                SUM(CASE WHEN bet_delta < 0 THEN -bet_delta ELSE 0 END)::BIGINT
                  AS rolled_back_bet,
                SUM(CASE WHEN win_delta < 0 THEN -win_delta ELSE 0 END)::BIGINT
                  AS rolled_back_win
              FROM transactions
              WHERE $3::TIMESTAMPTZ < $4::TIMESTAMPTZ
                AND created_at >= $4::TIMESTAMPTZ
                AND created_at < $2::TIMESTAMPTZ
              GROUP BY currency
            )
            SELECT
              currency,
              SUM(rounds)::BIGINT AS rounds,
              SUM(total_bet)::BIGINT AS total_bet,
              SUM(total_win)::BIGINT AS total_win,
              SUM(rolled_back_bet)::BIGINT AS rolled_back_bet,
              SUM(rolled_back_win)::BIGINT AS rolled_back_win
            FROM report_rows
            GROUP BY currency
            ORDER BY currency
          `,
          [
            window.from.toISOString(),
            window.to.toISOString(),
            bounds.hourFrom,
            bounds.hourTo,
            bounds.dayFrom,
            bounds.dayTo,
          ],
        ),
      );

      return { data: rows };
    },
  };
}
