import "zod/compile";
import { z } from "zod";

const NonNegativeDecimalIntegerSchema = z.string().regex(/^(?:0|[1-9]\d*)$/u);

export const UserRtpReportRowSchema = z
  .object({
    user_id: z.string().trim().min(1).max(255),
    currency: z.string().trim().min(1).max(16),
    rounds: NonNegativeDecimalIntegerSchema,
    total_bet: NonNegativeDecimalIntegerSchema,
    total_win: NonNegativeDecimalIntegerSchema,
    rtp: z.number().nonnegative().nullable(),
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
