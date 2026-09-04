import "zod/compile";
import { z } from "zod";

const NonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const SignedSafeIntegerSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const CasinoRtpReportRowSchema = z
  .object({
    currency: z.string().trim().min(1).max(16),
    rounds: NonNegativeSafeIntegerSchema,
    total_bet: SignedSafeIntegerSchema,
    total_win: SignedSafeIntegerSchema,
    rolled_back_bet: NonNegativeSafeIntegerSchema,
    rolled_back_win: NonNegativeSafeIntegerSchema,
    rtp: z.number().nullable(),
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
