import { Hono } from "hono";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST", "2");
});

import {
  GameAlreadyFinishedMessage,
  InsufficientFundsMessage,
  InvalidRequestMessage,
  TooManyActionsMessage,
  WalletNotFoundMessage,
} from "../error";
import type {
  BalanceLookupRequest,
  ProcessActionsRequest,
} from "./contract/processor.request";
import { createProcessHandler } from "./processor.handler";
import { randomUUID } from "crypto";

describe(createProcessHandler.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  describe("happy path", () => {
    it("processes actions using the provided time", async () => {
      const actionId = randomUUID();
      const requestBody = fixtures.given.requestBody(actionId);

      fixtures.given.dataSource.process({
        balance: "90",
        transactions: [{ action_id: actionId, tx_id: "tx-1" }],
      });

      const response = await fixtures.when.post(requestBody);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        balance: 90,
        game_id: "round-1",
        transactions: [{ action_id: actionId, tx_id: "tx-1" }],
      });
      fixtures.then.timeProvider.calledOnce();
      fixtures.then.dataSource.processedAt();
    });

    it("gets the balance without reading the time", async () => {
      fixtures.given.dataSource.balance("100");

      const response = await fixtures.when.post(
        fixtures.given.balanceLookupBody(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ balance: 100 });
      fixtures.then.timeProvider.notCalled();
    });
  });

  it("falls back to balance lookup for invalid process payloads", async () => {
    fixtures.given.dataSource.empty();

    const response = await fixtures.when.post({
      ...fixtures.given.requestBody(randomUUID()),
      unexpected: true,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(WalletNotFoundMessage);
  });

  it("falls back to balance lookup for invalid action IDs", async () => {
    fixtures.given.dataSource.balance("100");

    const response = await fixtures.when.post({
      ...fixtures.given.requestBody(randomUUID()),
      actions: [{ action: "bet", action_id: "action-1", amount: 10 }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balance: 100 });
    fixtures.then.timeProvider.notCalled();
  });

  it("rejects requests that exceed the configured action limit", async () => {
    const response = await fixtures.when.post({
      ...fixtures.given.requestBody(randomUUID()),
      actions: [
        { action: "bet", action_id: randomUUID(), amount: 10 },
        { action: "bet", action_id: randomUUID(), amount: 20 },
        { action: "bet", action_id: randomUUID(), amount: 30 },
      ],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(TooManyActionsMessage);
    fixtures.then.dataSource.notCalled();
    fixtures.then.timeProvider.notCalled();
  });

  it("returns 404 when the wallet does not exist", async () => {
    fixtures.given.dataSource.empty();

    const response = await fixtures.when.post(
      fixtures.given.balanceLookupBody(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(WalletNotFoundMessage);
  });

  it.each([
    ["BP001", 404, WalletNotFoundMessage],
    ["BP002", 400, InsufficientFundsMessage],
    ["BP003", 400, GameAlreadyFinishedMessage],
  ] as const)(
    "maps database error %s to HTTP %s",
    async (code, status, body) => {
      fixtures.given.dataSource.databaseError(code);

      const response = await fixtures.when.post(
        fixtures.given.requestBody(randomUUID()),
      );

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
    },
  );

  it("rethrows unexpected failures for the HTTP error handler", async () => {
    const error = new Error("connection lost");
    fixtures.given.dataSource.throws(error);

    await expect(
      fixtures.when.post(fixtures.given.requestBody(randomUUID())),
    ).rejects.toBe(error);
  });
});

function getFixtures() {
  const query = vi.fn().mockResolvedValue([]);
  const now = new Date("2026-09-02T12:34:56.789Z");
  const timeProvider = vi.fn(() => now);
  const dataSource = { query } as unknown as DataSource;
  const app = new Hono<{ Variables: { requestBody: unknown } }>();
  const handler = createProcessHandler(dataSource, timeProvider);

  app.use(async (context, next) => {
    context.set("requestBody", await context.req.json<unknown>());
    return next();
  });
  app.post("/", handler);
  app.onError((error) => {
    throw error;
  });

  return {
    given: {
      balanceLookupBody(): BalanceLookupRequest {
        return {
          user_id: "player-1",
          currency: "USD",
        };
      },
      requestBody(actionId: string): ProcessActionsRequest {
        return {
          user_id: "player-1",
          currency: "USD",
          game: "slots",
          game_id: "round-1",
          actions: [{ action: "bet", action_id: actionId, amount: 10 }],
          finished: true,
        };
      },
      dataSource: {
        balance(balance: string) {
          query.mockResolvedValue([{ balance }]);
        },
        process(result: {
          balance: string;
          transactions: { action_id: string; tx_id: string }[];
        }) {
          query.mockResolvedValue([result]);
        },
        empty() {
          query.mockResolvedValue([]);
        },
        databaseError(code: string) {
          query.mockRejectedValue({ driverError: { code } });
        },
        throws(error: Error) {
          query.mockRejectedValue(error);
        },
      },
    },
    when: {
      post(body: unknown) {
        return app.request("/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      },
    },
    then: {
      dataSource: {
        notCalled() {
          expect(query).not.toHaveBeenCalled();
        },
        processedAt() {
          expect((query.mock.calls[0]?.[1] as unknown[] | undefined)?.[8]).toBe(
            now,
          );
        },
      },
      timeProvider: {
        calledOnce() {
          expect(timeProvider).toHaveBeenCalledOnce();
        },
        notCalled() {
          expect(timeProvider).not.toHaveBeenCalled();
        },
      },
    },
  };
}
