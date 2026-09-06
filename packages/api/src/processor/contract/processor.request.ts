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

export const BalanceLookupRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(255),
  currency: z.string().trim().min(1).max(16),
});

export const ProcessActionsRequestSchema = BalanceLookupRequestSchema.extend({
  game: z.string().trim().min(1).max(255),
  game_id: z.string().trim().min(1).max(255),
  actions: z
    .array(
      z.discriminatedUnion("action", [MoneyActionSchema, RollbackActionSchema]),
    )
    .min(1),
  finished: z.boolean().optional(),
}).strict();

export const ProcessorRequestSchema = z.union([
  ProcessActionsRequestSchema,
  BalanceLookupRequestSchema,
]);

export type MoneyAction = z.infer<typeof MoneyActionSchema>;
export type RollbackAction = z.infer<typeof RollbackActionSchema>;
export type BalanceLookupRequest = z.infer<typeof BalanceLookupRequestSchema>;
export type ProcessActionsRequest = z.infer<typeof ProcessActionsRequestSchema>;
export type ProcessorRequest = z.infer<typeof ProcessorRequestSchema>;

export function isProcessActionsRequest(
  request: ProcessorRequest,
): request is ProcessActionsRequest {
  return "actions" in request;
}
