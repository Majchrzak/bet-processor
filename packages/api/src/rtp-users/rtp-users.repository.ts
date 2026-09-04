import "zod/compile";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { calculateTimeBucketBounds } from "../time";
import { encodeUserRtpCursor, type UserRtpCursor } from "./rtp-users.cursor";

const sql = String.raw;
const UserRtpDatabaseRowSchema = z
  .object({
    user_id: z.string().trim().min(1).max(255),
    currency: z.string().trim().min(1).max(16),
    rounds: z.string().regex(/^(?:0|[1-9]\d*)$/u),
    total_bet: z.string().regex(/^(?:0|-?[1-9]\d*)$/u),
    total_win: z.string().regex(/^(?:0|-?[1-9]\d*)$/u),
    rolled_back_bet: z.string().regex(/^(?:0|[1-9]\d*)$/u),
    rolled_back_win: z.string().regex(/^(?:0|[1-9]\d*)$/u),
  })
  .strict();

export type UserRtpDatabaseRow = z.infer<typeof UserRtpDatabaseRowSchema>;

export function createUserRtpRepository(dataSource: DataSource) {
  return {
    async report(options: {
      cursor?: UserRtpCursor;
      limit: number;
      window: { from: Date; to: Date };
    }) {
      const bounds = calculateTimeBucketBounds(options.window);

      // Cover the [from, to) window without overlap: read partial boundary
      // hours from transactions, complete hours from the hourly aggregate,
      // and complete UTC days from the daily aggregate, then combine every
      // segment into one total per currency. The conditional bounds skip
      // aggregate levels when the requested window contains no complete bucket.
      const rows = z.array(UserRtpDatabaseRowSchema).parse(
        await dataSource.query(
          sql`
            WITH report_rows AS (
              SELECT
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
              WHERE created_at >= $1::TIMESTAMPTZ
                AND created_at < CASE
                  WHEN $3::TIMESTAMPTZ < $4::TIMESTAMPTZ
                    THEN $3::TIMESTAMPTZ
                  ELSE $2::TIMESTAMPTZ
                END
                AND (user_id, currency) > ($7, $8)
              GROUP BY user_id, currency

              UNION ALL

              SELECT
                user_id, currency, rounds, total_bet, total_win,
                rolled_back_bet, rolled_back_win
              FROM agg_user_rtp_hourly
              WHERE $3::TIMESTAMPTZ < $4::TIMESTAMPTZ
                AND bucket >= $3::TIMESTAMPTZ
                AND bucket < CASE
                  WHEN $5::TIMESTAMPTZ < $6::TIMESTAMPTZ
                    THEN $5::TIMESTAMPTZ
                  ELSE $4::TIMESTAMPTZ
                END
                AND (user_id, currency) > ($7, $8)

              UNION ALL

              SELECT
                user_id, currency, rounds, total_bet, total_win,
                rolled_back_bet, rolled_back_win
              FROM agg_user_rtp_daily
              WHERE $5::TIMESTAMPTZ < $6::TIMESTAMPTZ
                AND bucket >= $5::TIMESTAMPTZ
                AND bucket < $6::TIMESTAMPTZ
                AND (user_id, currency) > ($7, $8)

              UNION ALL

              SELECT
                user_id, currency, rounds, total_bet, total_win,
                rolled_back_bet, rolled_back_win
              FROM agg_user_rtp_hourly
              WHERE $5::TIMESTAMPTZ < $6::TIMESTAMPTZ
                AND bucket >= $6::TIMESTAMPTZ
                AND bucket < $4::TIMESTAMPTZ
                AND (user_id, currency) > ($7, $8)

              UNION ALL

              SELECT
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
              WHERE $3::TIMESTAMPTZ < $4::TIMESTAMPTZ
                AND created_at >= $4::TIMESTAMPTZ
                AND created_at < $2::TIMESTAMPTZ
                AND (user_id, currency) > ($7, $8)
              GROUP BY user_id, currency
            )
            SELECT
              user_id,
              currency,
              SUM(rounds)::BIGINT AS rounds,
              SUM(total_bet)::BIGINT AS total_bet,
              SUM(total_win)::BIGINT AS total_win,
              SUM(rolled_back_bet)::BIGINT AS rolled_back_bet,
              SUM(rolled_back_win)::BIGINT AS rolled_back_win
            FROM report_rows
            GROUP BY user_id, currency
            ORDER BY user_id, currency
            LIMIT $9
          `,
          [
            options.window.from.toISOString(),
            options.window.to.toISOString(),
            bounds.hourFrom,
            bounds.hourTo,
            bounds.dayFrom,
            bounds.dayTo,
            options.cursor?.user_id ?? "",
            options.cursor?.currency ?? "",
            options.limit + 1,
          ],
        ),
      );

      const hasNextPage = rows.length > options.limit;
      const data = rows.slice(0, options.limit);
      const lastRow = data.at(-1);

      return {
        data,
        next_cursor:
          hasNextPage && lastRow
            ? encodeUserRtpCursor({
                user_id: lastRow.user_id,
                currency: lastRow.currency,
                from: options.window.from.toISOString(),
                to: options.window.to.toISOString(),
              })
            : null,
      };
    },
  };
}
