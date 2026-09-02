import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  ProcessorRequestSchema,
  type ProcessorRequest,
} from "./processor.request";

const ACTION_ID = "action-1";

describe("ProcessorRequestSchema", () => {
  it("accepts strict actions and infers the request type", () => {
    const request = ProcessorRequestSchema.parse({
      user_id: "player-000001",
      currency: "USD",
      game: "slots",
      game_id: "round-1",
      finished: true,
      actions: [{ action: "bet", action_id: ACTION_ID, amount: 100 }],
    });

    expectTypeOf(request).toEqualTypeOf<ProcessorRequest>();
  });

  it.each([
    { action: "bet", action_id: 1, amount: 100 },
    { action: "win", action_id: ACTION_ID, amount: 0 },
    {
      action: "win",
      action_id: ACTION_ID,
      amount: Number.MAX_SAFE_INTEGER + 1,
    },
    { action: "rollback", action_id: ACTION_ID, original_action_id: 1 },
    { action: "bet", action_id: ACTION_ID, amount: 100, surprise: true },
  ])("rejects an invalid action: $action", (action) => {
    expect(() =>
      ProcessorRequestSchema.parse({
        user_id: "player",
        currency: "USD",
        game: "slots",
        game_id: "round",
        actions: [action],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects unknown request fields", () => {
    expect(() =>
      ProcessorRequestSchema.parse({
        user_id: "player",
        currency: "USD",
        game: "slots",
        game_id: "round",
        unknown: true,
      }),
    ).toThrow(z.ZodError);
  });
});
