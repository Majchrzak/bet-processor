import "zod/compile";
import { z } from "zod";

import { createDeterministicKey } from "../deterministic-key";
import type { ProcessorRequest } from "./contract/processor.request";
import {
  ProcessorResponseSchema,
  type ProcessorResponse,
} from "./contract/processor.response";

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

export interface ProcessorDataSource {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface ProcessorRepository {
  getBalance: (
    request: ProcessorRequest,
  ) => Promise<ProcessorResponse | undefined>;
  process: (
    request: ProcessorRequest,
  ) => Promise<ProcessorResponse | undefined>;
}

export function createProcessorRepository(
  dataSource: ProcessorDataSource,
  now: () => Date = () => new Date(),
): ProcessorRepository {
  return {
    async getBalance(request: ProcessorRequest) {
      const rows: unknown = await dataSource.query(
        `
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

    async process(request: ProcessorRequest) {
      if (!request.actions?.length) {
        throw new Error(
          "At least one action is required for action processing",
        );
      }

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

      const rows = await dataSource.query(
        `
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
          now(),
        ],
      );

      const [result] = z.array(ProcessedActionsRowSchema).parse(rows);

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
