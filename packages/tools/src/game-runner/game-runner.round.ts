import { randomUUID } from "node:crypto";

import { createSeedUserId } from "../identifiers";
import type { ProcessAction } from "../api";
import type { RunConfig } from "./game-runner.config";

const BET_AMOUNT = 100;
const RTP_CYCLE_ROUNDS = 20;
const WIN_MULTIPLIER = 19;

export function generateRound(config: RunConfig, roundIndex: number) {
  const totalWin =
    (roundIndex + 1) % RTP_CYCLE_ROUNDS === 0 ? BET_AMOUNT * WIN_MULTIPLIER : 0;
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
