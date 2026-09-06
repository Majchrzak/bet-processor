import "zod/compile";
import type { Context } from "hono";
import type { DataSource } from "typeorm";

import { config } from "../config";
import {
  parseTimeWindow,
  InvalidTimeOrder,
  TimeRangeTooLarge,
  InvalidTimeParameter,
} from "../time";
import { CasinoRtpReportQuerySchema } from "./contract/rtp-casino.request";
import {
  CasinoRtpReportResponseSchema,
  type CasinoRtpReportRow,
} from "./contract/rtp-casino.response";
import {
  createCasinoRtpRepository,
  type CasinoRtpDatabaseRow,
} from "./rtp-casino.repository";
import {
  InvalidRequestMessage,
  InvalidTimeOrderMessage,
  TimeRangeTooLargeMessage,
} from "../error";

export function createCasinoRtpHandler(dataSource: DataSource) {
  const repository = createCasinoRtpRepository(dataSource);
  const { BET_PROCESSOR_RTP_MAX_RANGE_DAYS } = config();

  return async (context: Context) => {
    const query = CasinoRtpReportQuerySchema.safeParse(context.req.query());

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

    const result = await repository.report(window);

    return context.json(
      CasinoRtpReportResponseSchema.parse({
        data: result.data.map(toCasinoRtpReportRow),
      }),
    );
  };
}

function toCasinoRtpReportRow(row: CasinoRtpDatabaseRow): CasinoRtpReportRow {
  // not safe, bigint to number
  const rounds = Number(BigInt(row.rounds));
  const totalBet = Number(BigInt(row.total_bet));
  const totalWin = Number(BigInt(row.total_win));
  const rolledBackBet = Number(BigInt(row.rolled_back_bet));
  const rolledBackWin = Number(BigInt(row.rolled_back_win));
  const rtp = totalBet === 0 ? null : totalWin / totalBet;

  return {
    currency: row.currency,
    rounds,
    total_bet: totalBet,
    total_win: totalWin,
    rolled_back_bet: rolledBackBet,
    rolled_back_win: rolledBackWin,
    rtp,
  };
}
