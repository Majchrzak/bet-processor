import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  ErrorResponseSchema,
  ProcessorResponseSchema,
  type ErrorResponse,
  type ProcessorResponse,
} from "./processor.response";

describe("processor response schemas", () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("accepts balance-only responses", () => {
      const body = fixtures.given.balanceOnlyResponse();

      fixtures.then.processorResponse.succeeds(
        fixtures.when.parseProcessorResponse(body),
        body,
      );
    });

    it("accepts action responses with string transaction IDs", () => {
      const body = fixtures.given.actionResponse();

      fixtures.then.processorResponse.succeeds(
        fixtures.when.parseProcessorResponse(body),
        body,
      );
    });

    it("accepts domain error responses", () => {
      const body = fixtures.given.errorResponse();

      fixtures.then.errorResponse.succeeds(
        fixtures.when.parseErrorResponse(body),
        body,
      );
      expectTypeOf(body).toEqualTypeOf<ErrorResponse>();
    });
  });

  describe("processor response rejections", () => {
    it.each([
      ["negative balance", { balance: -1 }],
      ["unsafe balance", { balance: Number.MAX_SAFE_INTEGER + 1 }],
      [
        "unknown fields",
        {
          balance: 100,
          unexpected: true,
        },
      ],
    ] as const)("rejects %s", (_label, body) => {
      fixtures.then.processorResponse.fails(
        fixtures.when.parseProcessorResponse(body),
      );
    });
  });

  describe("error response rejections", () => {
    it.each([
      ["fractional code", { code: 100.5, message: "Insufficient funds" }],
      ["empty message", { code: 100, message: "" }],
      [
        "unknown fields",
        { code: 100, message: "Insufficient funds", extra: 1 },
      ],
    ] as const)("rejects %s", (_label, body) => {
      fixtures.then.errorResponse.fails(fixtures.when.parseErrorResponse(body));
    });
  });
});

function getFixtures() {
  return {
    given: {
      balanceOnlyResponse(): ProcessorResponse {
        return { balance: 74322001 };
      },

      actionResponse(): ProcessorResponse {
        return {
          balance: 100,
          game_id: "round-1",
          transactions: [{ action_id: "action-1", tx_id: "transaction-1" }],
        };
      },

      errorResponse(): ErrorResponse {
        return {
          code: 100,
          message: "Player has not enough funds to process an action",
        };
      },
    },

    when: {
      parseProcessorResponse(body: unknown) {
        return ProcessorResponseSchema.safeParse(body);
      },

      parseErrorResponse(body: unknown) {
        return ErrorResponseSchema.safeParse(body);
      },
    },

    then: {
      processorResponse: {
        succeeds(
          result: ReturnType<typeof ProcessorResponseSchema.safeParse>,
          expected: ProcessorResponse,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof ProcessorResponseSchema.safeParse>) {
          expect(result.success).toBe(false);
        },
      },

      errorResponse: {
        succeeds(
          result: ReturnType<typeof ErrorResponseSchema.safeParse>,
          expected: ErrorResponse,
        ) {
          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.data).toEqual(expected);
        },

        fails(result: ReturnType<typeof ErrorResponseSchema.safeParse>) {
          expect(result.success).toBe(false);
        },
      },
    },
  };
}
