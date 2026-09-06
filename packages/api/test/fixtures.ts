import { Pool } from "pg";
import { expect } from "vitest";

import { createDeterministicKey } from "../src/deterministic-key";
import { createHmacSha256Digest } from "../src/hmac";
import {
  ErrorResponseSchema,
  ProcessorResponseSchema,
} from "../src/processor/contract/processor.response";
import { CasinoRtpReportResponseSchema } from "../src/rtp-casino/contract/rtp-casino.response";
import { UserRtpReportResponseSchema } from "../src/rtp-users/contract/rtp-users.response";

export async function getFixtures() {
  let uuidSequence = 0;

  const nextRandomUUID = () =>
    createDeterministicKey(["acceptance-test", String(uuidSequence++)]);

  const database = new Pool({
    connectionString:
      process.env.BET_PROCESSOR_DATABASE_URL ??
      "postgresql://postgres:development-db-password@localhost:5432/bet_processor",
  });

  const apiUrl =
    process.env.BET_PROCESSOR_ACCEPTANCE_API_URL ?? "http://localhost:3000";

  const hmacSecret =
    process.env.BET_PROCESSOR_HMAC_SECRET ?? "development-hmac-secret";

  async function cleanup() {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM transactions");
      await client.query("DELETE FROM hot_game_action");
      await client.query("DELETE FROM game_round");
      await client.query("DELETE FROM wallet");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  try {
    await cleanup();
  } catch (error) {
    await database.end();
    throw error;
  }

  return {
    database,
    given: {
      async user(balance: number, currency: string) {
        const userId = nextRandomUUID();
        const createdAt = new Date();
        await database.query(
          `INSERT INTO wallet (id, balance, created_at, updated_at)
           VALUES ($1, $2, $3, $3)`,
          [
            createDeterministicKey(["wallet", userId, currency]),
            balance,
            createdAt,
          ],
        );

        return { userId, currency };
      },

      game(name: string) {
        return { gameId: nextRandomUUID(), name };
      },

      action: {
        bet(amount: number) {
          return { action: "bet", action_id: nextRandomUUID(), amount };
        },
        win(amount: number) {
          return { action: "win", action_id: nextRandomUUID(), amount };
        },
        rollback(original_action_id: string) {
          return {
            action: "rollback",
            action_id: nextRandomUUID(),
            original_action_id,
          };
        },
      },

      unsignedRequest(body: unknown): RequestInit {
        return {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        };
      },

      async timeWindow(userIds: string[]) {
        const timestamps = await database.query<{
          earliest: Date;
          latest: Date;
        }>(
          `SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest
           FROM transactions
           WHERE user_id = ANY($1::TEXT[])`,
          [userIds],
        );
        const bounds = timestamps.rows[0];
        if (!bounds) throw new Error("No transactions found for time window");

        return {
          from: new Date(bounds.earliest.getTime() - 1).toISOString(),
          to: new Date(bounds.latest.getTime() + 1).toISOString(),
        };
      },

      signedRequest(body: {
        user: { userId: string; currency: string };
        game: { name: string; gameId?: string };
        actions?: unknown[];
        finished?: boolean;
      }): RequestInit {
        const serializedBody = JSON.stringify({
          user_id: body.user.userId,
          currency: body.user.currency,
          game: body.game.name,
          game_id: body.game.gameId,
          actions: body.actions,
          finished: body.finished,
        });

        return {
          method: "POST",
          headers: {
            authorization: `HMAC-SHA256 ${createHmacSha256Digest(
              serializedBody,
              hmacSecret,
            )}`,
            "content-type": "application/json",
          },
          body: serializedBody,
        };
      },
    },

    when: {
      async process(request: RequestInit) {
        return await fetch(
          new URL("/aggregator/takehome/process", apiUrl),
          request,
        );
      },

      async reportUsers(
        window: { from: string; to: string },
        options: { limit?: string; cursor?: string; authorized?: boolean } = {},
      ) {
        const query = new URLSearchParams(window);

        if (options.limit !== undefined) {
          query.set("limit", options.limit);
        }

        if (options.cursor !== undefined) {
          query.set("cursor", options.cursor);
        }

        return await fetch(
          new URL(`/reports/rtp/users?${query.toString()}`, apiUrl),
          options.authorized === false
            ? undefined
            : {
                headers: {
                  authorization: `HMAC-SHA256 ${createHmacSha256Digest(
                    "",
                    hmacSecret,
                  )}`,
                },
              },
        );
      },

      async reportCasino(
        window: { from: string; to: string },
        authorized = true,
      ) {
        return await fetch(
          new URL(
            `/reports/rtp/casino?${new URLSearchParams(window).toString()}`,
            apiUrl,
          ),
          authorized
            ? {
                headers: {
                  authorization: `HMAC-SHA256 ${createHmacSha256Digest(
                    "",
                    hmacSecret,
                  )}`,
                },
              }
            : undefined,
        );
      },
    },

    then: {
      async succeeded(response: Response, expected: unknown) {
        const body = ProcessorResponseSchema.parse(await response.json());

        expect(response.status).toEqual(200);
        expect(body).toEqual(expected);
      },

      async errored(response: Response, expected: unknown) {
        const body = ErrorResponseSchema.parse(await response.json());

        expect(response.status).toEqual(400);
        expect(body).toEqual(expected);
      },

      async userRtpReport(response: Response, expected: unknown) {
        const body = UserRtpReportResponseSchema.parse(await response.json());

        expect(response.status).toEqual(200);
        expect(body).toEqual(expected);
      },

      async userRtpReportPage(response: Response) {
        expect(response.status).toEqual(200);
        return UserRtpReportResponseSchema.parse(await response.json());
      },

      async casinoRtpReport(response: Response, expected: unknown) {
        const body = CasinoRtpReportResponseSchema.parse(await response.json());

        expect(response.status).toEqual(200);
        expect(body).toEqual(expected);
      },
    },

    async dispose() {
      await database.end();
    },
  };
}
