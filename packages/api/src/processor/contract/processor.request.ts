import "zod/compile";
import { z } from "zod";

export const MoneyActionSchema = z
  .object({
    action: z.enum(["bet", "win"]),
    action_id: z.uuid(),
    amount: z.number().int().positive(),
  })
  .strict();

export const RollbackActionSchema = z
  .object({
    action: z.literal("rollback"),
    action_id: z.uuid(),
    original_action_id: z.uuid(),
  })
  .strict();

export const ProcessorRequestSchema = z
  .object({
    user_id: z.string().trim().min(1).max(255),
    currency: z.string().trim().min(1).max(16),
    game: z.string().trim().min(1).max(255),
    game_id: z.string().trim().min(1).max(255),
    actions: z
      .array(
        z.discriminatedUnion("action", [
          MoneyActionSchema,
          RollbackActionSchema,
        ]),
      )
      .optional(),
    finished: z.boolean().optional(),
  })
  .strict();

export type MoneyAction = z.infer<typeof MoneyActionSchema>;
export type RollbackAction = z.infer<typeof RollbackActionSchema>;
export type ProcessorRequest = z.infer<typeof ProcessorRequestSchema>;
