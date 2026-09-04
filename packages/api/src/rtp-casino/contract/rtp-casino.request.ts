import "zod/compile";
import { z } from "zod";

export const CasinoRtpReportQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .strict();

export const RtpReportQuerySchema = CasinoRtpReportQuerySchema;

export type CasinoRtpReportQuery = z.infer<typeof CasinoRtpReportQuerySchema>;
export type RtpReportQuery = z.infer<typeof RtpReportQuerySchema>;
