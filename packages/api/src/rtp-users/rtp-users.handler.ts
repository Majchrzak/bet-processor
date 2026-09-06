import "zod/compile";
import type { Context } from "hono";
import type { DataSource } from "typeorm";

import { config } from "../config";
import {
  InvalidTimeOrder,
  InvalidTimeParameter,
  parseTimeWindow,
  TimeRangeTooLarge,
} from "../time";
import { UserRtpReportQuerySchema } from "./contract/rtp-users.request";
import {
  UserRtpReportResponseSchema,
  type UserRtpReportRow,
} from "./contract/rtp-users.response";
import { decodeUserRtpCursor, InvalidCursorString } from "./rtp-users.cursor";
import {
  createUserRtpRepository,
  type UserRtpDatabaseRow,
} from "./rtp-users.repository";
import {
  CursorMalformedMessage,
  CursorTimeWindowMismatchMessage,
  InvalidRequestMessage,
  InvalidTimeOrderMessage,
  TimeRangeTooLargeMessage,
} from "../error";

export function createUserRtpHandler(dataSource: DataSource) {
  const repository = createUserRtpRepository(dataSource);
  const { BET_PROCESSOR_RTP_MAX_RANGE_DAYS } = config();

  return async (context: Context) => {
    const query = UserRtpReportQuerySchema.safeParse(context.req.query());

    if (!query.success) {
      return context.json(InvalidRequestMessage, 400);
    }

    const window = parseTimeWindow(
      query.data.from,
      query.data.to,
      BET_PROCESSOR_RTP_MAX_RANGE_DAYS,
    );

    switch (window) {
      case InvalidTimeOrder:
        return context.json(InvalidTimeOrderMessage, 400);
      case TimeRangeTooLarge:
        return context.json(TimeRangeTooLargeMessage, 400);
      case InvalidTimeParameter:
        return context.json(InvalidTimeParameter, 400);
    }

    const cursor = query.data.cursor
      ? decodeUserRtpCursor(query.data.cursor)
      : undefined;

    switch (cursor) {
      case InvalidCursorString:
        return context.json(CursorMalformedMessage, 400);
    }

    if (
      cursor &&
      (cursor.from !== window.from.toISOString() ||
        cursor.to !== window.to.toISOString())
    ) {
      return context.json(CursorTimeWindowMismatchMessage, 400);
    }

    const result = await repository.report({
      ...(cursor ? { cursor } : {}),
      limit: query.data.limit,
      window,
    });

    return context.json(
      UserRtpReportResponseSchema.parse({
        ...result,
        data: result.data.map(toUserRtpReportRow),
      }),
    );
  };
}

function toUserRtpReportRow(row: UserRtpDatabaseRow): UserRtpReportRow {
  // not safe, bigint to number
  const rounds = Number(BigInt(row.rounds));
  const totalBet = Number(BigInt(row.total_bet));
  const totalWin = Number(BigInt(row.total_win));
  const rolledBackBet = Number(BigInt(row.rolled_back_bet));
  const rolledBackWin = Number(BigInt(row.rolled_back_win));
  const rtp = totalBet === 0 ? null : totalWin / totalBet;

  return {
    user_id: row.user_id,
    currency: row.currency,
    rounds,
    total_bet: totalBet,
    total_win: totalWin,
    rolled_back_bet: rolledBackBet,
    rolled_back_win: rolledBackWin,
    rtp,
  };
}
