import "zod/compile";
import { z } from "zod";

export const UserRtpCursorSchema = z
  .object({
    user_id: z.string().trim().min(1).max(255),
    currency: z.string().trim().min(1).max(16),
    from: z.iso.datetime({ precision: 3 }),
    to: z.iso.datetime({ precision: 3 }),
  })
  .strict();

export type UserRtpCursor = z.infer<typeof UserRtpCursorSchema>;

export function encodeUserRtpCursor(cursor: UserRtpCursor): string {
  return Buffer.from(
    JSON.stringify(UserRtpCursorSchema.parse(cursor)),
    "utf8",
  ).toString("base64url");
}

export const InvalidCursorString = Symbol("InvalidCursorString");

export function decodeUserRtpCursor(cursor: string) {
  try {
    const decoded = Buffer.from(cursor, "base64url");

    if (decoded.toString("base64url") !== cursor) {
      return InvalidCursorString;
    }

    return UserRtpCursorSchema.parse(JSON.parse(decoded.toString("utf8")));
  } catch {
    return InvalidCursorString;
  }
}
