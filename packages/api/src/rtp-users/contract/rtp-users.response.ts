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

export const UserRtpReportRowSchema = z
  .object({
    user_id: z.string().trim().min(1).max(255),
    currency: z.string().trim().min(1).max(16),
    rounds: NonNegativeSafeIntegerSchema,
    total_bet: SignedSafeIntegerSchema,
    total_win: SignedSafeIntegerSchema,
    rolled_back_bet: NonNegativeSafeIntegerSchema,
    rolled_back_win: NonNegativeSafeIntegerSchema,
    rtp: z.number().nullable(),
  })
  .strict();

export const UserRtpReportResponseSchema = z
  .object({
    data: z.array(UserRtpReportRowSchema),
    next_cursor: z.string().min(1).max(4_096).nullable(),
  })
  .strict();

export type UserRtpReportResponse = z.infer<typeof UserRtpReportResponseSchema>;
export type UserRtpReportRow = z.infer<typeof UserRtpReportRowSchema>;
