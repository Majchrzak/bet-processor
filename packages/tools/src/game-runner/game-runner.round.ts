import { randomUUID } from "node:crypto";

import { createSeedUserId } from "../identifiers";
import type { ProcessAction } from "../api";
import type { RunConfig } from "./game-runner.config";
import { generateMultiplier } from "./game-runner.payout";
import { createRoundRandom } from "./game-runner.random";

export const BET_AMOUNT = 100;

export function generateRound(config: RunConfig, roundIndex: number) {
  const multiplier = generateMultiplier(
    createRoundRandom(config.namespace, roundIndex),
  );
  const totalWin = BET_AMOUNT * multiplier;
  const actions: ProcessAction[] = [
    { action: "bet", action_id: randomUUID(), amount: BET_AMOUNT },
  ];

  if (totalWin > 0) {
    actions.push({ action: "win", action_id: randomUUID(), amount: totalWin });
  }

  return {
    actions,
    gameId: randomUUID(),
    totalBet: BET_AMOUNT,
    totalWin,
    userId: createSeedUserId((roundIndex % config.users) + 1, config.namespace),
  };
}
