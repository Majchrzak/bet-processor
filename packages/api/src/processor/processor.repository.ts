import "zod/compile";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { createDeterministicKey } from "../deterministic-key";
import type { TimeProvider } from "../time";
import type {
  BalanceLookupRequest,
  ProcessActionsRequest,
} from "./contract/processor.request";
import {
  ProcessorResponseSchema,
  type ProcessorResponse,
} from "./contract/processor.response";

const sql = String.raw;

const DatabaseBalanceSchema = z
  .object({ balance: z.string().regex(/^\d+$/) })
  .strict();

const ProcessedActionsRowSchema = DatabaseBalanceSchema.extend({
  transactions: z.array(
    z.object({
      action_id: z.string(),
      tx_id: z.string(),
    }),
  ),
}).strict();

export const WalletNotFoundDatabaseError = "BP001";
export const InsufficientFundsDatabaseError = "BP002";
export const GameAlreadyFinishedDatabaseError = "BP003";

export function createProcessorRepository(
  dataSource: DataSource,
  timeProvider: TimeProvider,
) {
  return {
    async getBalance(
      request: BalanceLookupRequest,
    ): Promise<ProcessorResponse | undefined> {
      const rows: unknown = await dataSource.query(
        sql`
          SELECT balance
          FROM wallet
          WHERE id = $1
          LIMIT 1
        `,
        [createDeterministicKey(["wallet", request.user_id, request.currency])],
      );

      const [wallet] = z.array(DatabaseBalanceSchema).parse(rows);

      return wallet
        ? ProcessorResponseSchema.parse({
            balance: Number(BigInt(wallet.balance)),
          })
        : undefined;
    },

    async process(
      request: ProcessActionsRequest,
    ): Promise<ProcessorResponse | undefined> {
      const walletId = createDeterministicKey([
        "wallet",
        request.user_id,
        request.currency,
      ]);

      const gameRoundId = createDeterministicKey([
        "game",
        walletId,
        request.game,
        request.game_id,
      ]);

      const actions = request.actions.map((action) => ({
        ...action,
        action_key: createDeterministicKey([
          "action",
          gameRoundId,
          action.action_id,
        ]),
        original_action_key:
          action.action === "rollback"
            ? createDeterministicKey([
                "action",
                gameRoundId,
                action.original_action_id,
              ])
            : undefined,
      }));

      const [result] = z.array(ProcessedActionsRowSchema).parse(
        await dataSource.query(
          sql`
            SELECT balance, transactions
            FROM process_game_actions(
              $1, $2, $3,
              $4, $5, $6,
              $7, $8::jsonb, $9::timestamptz
            )
          `,
          [
            request.user_id,
            request.currency,
            walletId,
            request.game,
            request.game_id,
            gameRoundId,
            request.finished === true,
            JSON.stringify(actions),
            timeProvider(),
          ],
        ),
      );

      if (!result) {
        throw new Error("Action processing returned no result");
      }

      return ProcessorResponseSchema.parse({
        balance: Number(BigInt(result.balance)),
        game_id: request.game_id,
        transactions: result.transactions,
      });
    },
  };
}
