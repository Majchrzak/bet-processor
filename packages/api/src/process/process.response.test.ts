import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ErrorResponseSchema,
  ProcessResponseSchema,
  type ErrorResponse,
} from "./process.response";

describe("ProcessResponseSchema", () => {
  it("accepts string transaction IDs without requiring UUIDs", () => {
    expect(
      ProcessResponseSchema.parse({
        balance: 100,
        transactions: [{ action_id: "action-1", tx_id: "transaction-1" }],
      }),
    ).toEqual({
      balance: 100,
      transactions: [{ action_id: "action-1", tx_id: "transaction-1" }],
    });
  });

  it("rejects negative and unsafe balances", () => {
    expect(() => ProcessResponseSchema.parse({ balance: -1 })).toThrow(
      z.ZodError,
    );
    expect(() =>
      ProcessResponseSchema.parse({
        balance: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(z.ZodError);
  });
});

describe("ErrorResponseSchema", () => {
  it("exposes code as an integer number", () => {
    const response: ErrorResponse = {
      code: 100,
      message: "Insufficient funds",
    };

    expect(ErrorResponseSchema.parse(response)).toEqual(response);
    expect(
      ErrorResponseSchema.parse({ code: 101, message: "Insufficient funds" }),
    ).toEqual({ code: 101, message: "Insufficient funds" });
    expect(() =>
      ErrorResponseSchema.parse({
        code: 100.5,
        message: "Insufficient funds",
      }),
    ).toThrow(z.ZodError);
  });
});
