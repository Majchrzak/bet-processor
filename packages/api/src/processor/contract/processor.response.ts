import "zod/compile";
import { z } from "zod";

export const ProcessorResponseSchema = z
  .object({
    balance: z.number().int().nonnegative(),
    game_id: z.string().trim().min(1).max(255).optional(),
    transactions: z
      .array(
        z.object({
          action_id: z.string(),
          tx_id: z.string(),
        }),
      )
      .optional(),
  })
  .strict();

export const ErrorResponseSchema = z
  .object({
    code: z.number().int(),
    message: z.string().min(1),
  })
  .strict();

export type ProcessorResponse = z.infer<typeof ProcessorResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
