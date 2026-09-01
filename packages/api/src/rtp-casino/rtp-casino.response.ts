import "zod/compile";
import { z } from "zod";

const NonNegativeDecimalIntegerSchema = z.string().regex(/^(?:0|[1-9]\d*)$/u);

export const CasinoRtpReportRowSchema = z
  .object({
    currency: z.string().trim().min(1).max(16),
    rounds: NonNegativeDecimalIntegerSchema,
    total_bet: NonNegativeDecimalIntegerSchema,
    total_win: NonNegativeDecimalIntegerSchema,
    rtp: z.number().nonnegative().nullable(),
  })
  .strict();

export const CasinoRtpReportResponseSchema = z
  .object({
    data: z.array(CasinoRtpReportRowSchema),
  })
  .strict();

export type CasinoRtpReportRow = z.infer<typeof CasinoRtpReportRowSchema>;
export type CasinoRtpReportResponse = z.infer<
  typeof CasinoRtpReportResponseSchema
>;
