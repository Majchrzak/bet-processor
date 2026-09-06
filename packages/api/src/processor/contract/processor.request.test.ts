import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  BalanceLookupRequestSchema,
  ProcessActionsRequestSchema,
  ProcessorRequestSchema,
  isProcessActionsRequest,
  type BalanceLookupRequest,
  type ProcessActionsRequest,
  type ProcessorRequest,
} from "./processor.request";

describe("processor request schemas", () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("accepts balance lookup with user_id and currency only", () => {
      const body = fixtures.given.balanceLookup();

      fixtures.then.balanceLookup.succeeds(
        fixtures.when.parseBalance(body),
        body,
      );
      expectTypeOf(body).toEqualTypeOf<BalanceLookupRequest>();
    });

    it("accepts process actions with required game fields", () => {
      const body = fixtures.given.processActions();

      fixtures.then.processActions.succeeds(
        fixtures.when.parseProcessActions(body),
        body,
      );
      expectTypeOf(body).toEqualTypeOf<ProcessActionsRequest>();
    });

    it("parses balance lookup through the union schema", () => {
      const body = fixtures.given.balanceLookup();

      fixtures.then.processorRequest.isBalanceLookup(
        fixtures.when.parseProcessorRequest(body),
        body,
      );
    });

    it("parses process actions through the union schema", () => {
      const body = fixtures.given.processActions();

      fixtures.then.processorRequest.isProcessActions(
        fixtures.when.parseProcessorRequest(body),
        body,
      );
    });
  });

  describe("balance lookup rejections", () => {
    it.each([
      ["game", { game: "acceptance:test" }],
      ["game_id", { game_id: "round-1" }],
      ["actions", { actions: [] }],
    ] as const)("rejects balance lookup with unexpected %s", (_label, extra) => {
      fixtures.then.balanceLookup.fails(
        fixtures.when.parseBalance({
          ...fixtures.given.balanceLookup(),
          ...extra,
        }),
      );
    });
  });

  describe("process actions rejections", () => {
    it("requires game_id", () => {
      fixtures.then.processActions.fails(
        fixtures.when.parseProcessActions(
          fixtures.given.processActionsWithoutGameId(),
        ),
      );
    });

    it("rejects unknown request fields", () => {
      fixtures.then.processActions.fails(
        fixtures.when.parseProcessActions({
          ...fixtures.given.processActions(),
          unexpected: true,
        }),
      );
    });

    it.each([
      { action: "bet", action_id: 1, amount: 100 },
      { action: "bet", action_id: "action-1", amount: 100 },
      { action: "win", action_id: randomUUID(), amount: 0 },
      {
        action: "win",
        action_id: randomUUID(),
        amount: Number.MAX_SAFE_INTEGER + 1,
      },
      {
        action: "rollback",
        action_id: randomUUID(),
        original_action_id: 1,
      },
      {
        action: "rollback",
        action_id: randomUUID(),
        original_action_id: "action-1",
      },
      {
        action: "bet",
        action_id: randomUUID(),
        amount: 100,
        surprise: true,
      },
    ])("rejects an invalid action: $action", (action) => {
      fixtures.then.processActions.fails(
        fixtures.when.parseProcessActions({
          ...fixtures.given.processActions(),
          actions: [action],
        }),
      );
    });
  });

  describe("processor request union rejections", () => {
    it.each([
      [
        "empty actions with game fields",
        {
          user_id: "player",
          currency: "USD",
          game: "slots",
          actions: [],
        },
      ],
      [
        "game_id without actions",
        {
          user_id: "player",
          currency: "USD",
          game: "slots",
          game_id: "round",
        },
      ],
    ] as const)("%s", (_label, body) => {
      fixtures.then.processorRequest.fails(
        fixtures.when.parseProcessorRequest(body),
      );
    });
  });
});

function getFixtures() {
  const actionId = randomUUID();

  const processActions = (
    overrides: Partial<ProcessActionsRequest> = {},
  ): ProcessActionsRequest => ({
    user_id: "player-000001",
    currency: "USD",
    game: "slots",
    game_id: "round-1",
    finished: true,
    actions: [{ action: "bet", action_id: actionId, amount: 100 }],
    ...overrides,
  });

  return {
    given: {
      balanceLookup(
        overrides: Partial<BalanceLookupRequest> = {},
      ): BalanceLookupRequest {
        return {
          user_id: "8|USDT|USD",
          currency: "USD",
          ...overrides,
        };
      },

      processActions,

      processActionsWithoutGameId(): Omit<ProcessActionsRequest, "game_id"> {
        const { user_id, currency, game, actions, finished } = processActions();

        return { user_id, currency, game, actions, finished };
      },
    },

    when: {
      parseBalance(body: unknown) {
        return BalanceLookupRequestSchema.safeParse(body);
      },

      parseProcessActions(body: unknown) {
        return ProcessActionsRequestSchema.safeParse(body);
      },

      parseProcessorRequest(body: unknown) {
        return ProcessorRequestSchema.safeParse(body);
      },
    },

    then: {
      balanceLookup: {
        succeeds(
          result: ReturnType<typeof BalanceLookupRequestSchema.safeParse>,
          expected: BalanceLookupRequest,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof BalanceLookupRequestSchema.safeParse>) {
          expect(result.success).toBe(false);
        },
      },

      processActions: {
        succeeds(
          result: ReturnType<typeof ProcessActionsRequestSchema.safeParse>,
          expected: ProcessActionsRequest,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof ProcessActionsRequestSchema.safeParse>) {
          expect(result.success).toBe(false);
        },
      },

      processorRequest: {
        succeeds(
          result: ReturnType<typeof ProcessorRequestSchema.safeParse>,
          expected: ProcessorRequest,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof ProcessorRequestSchema.safeParse>) {
          expect(result.success).toBe(false);
        },

        isBalanceLookup(
          result: ReturnType<typeof ProcessorRequestSchema.safeParse>,
          expected: BalanceLookupRequest,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(isProcessActionsRequest(result.data)).toBe(false);
          expect(result.data).toEqual(expected);
          expect(result.data).not.toHaveProperty("game");
        },

        isProcessActions(
          result: ReturnType<typeof ProcessorRequestSchema.safeParse>,
          expected: ProcessActionsRequest,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(isProcessActionsRequest(result.data)).toBe(true);
          expect(result.data).toEqual(expected);
        },
      },
    },
  };
}
