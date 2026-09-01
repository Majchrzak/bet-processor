import "zod/compile";
import { z } from "zod";

export const UserRtpCursorSchema = z
  .object({
    user_id: z.string().trim().min(1).max(255),
    currency: z.string().trim().min(1).max(16),
  })
  .strict();

export type UserRtpCursor = z.infer<typeof UserRtpCursorSchema>;
