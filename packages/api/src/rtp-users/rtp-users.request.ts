import 'zod/compile';
import { z } from 'zod';

export const UserRtpReportQuerySchema = z.object({
  from: z.iso.datetime({ precision: 3 }),
  to: z.iso.datetime({ precision: 3 }),
  cursor: z.string().min(1).max(4_096).optional(),
  limit: z.coerce.number().int().min(1).max(1_000).default(100),
}).strict();

export type UserRtpReportQuery = z.infer<typeof UserRtpReportQuerySchema>;
