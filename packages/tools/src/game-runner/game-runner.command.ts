import type { Command } from "commander";
import { z } from "zod";

import { sendProcessRequest } from "../api";
import { parseRunConfig, type RunConfig } from "./game-runner.config";
import { EXPECTED_RTP } from "./game-runner.payout";
import { generateRound } from "./game-runner.round";
import { verifyCasinoRtp, verifyUserRtp } from "./game-runner.rtp";

type RunOptions = Parameters<typeof parseRunConfig>[0];

export function registerGameRunnerCommand(program: Command): void {
  const command = program
    .command("run")
    .description("run randomized games and verify reported RTP")
    .option("--api-url <url>", "bet processor API URL")
    .option("--concurrency <count>", "maximum concurrent rounds")
    .option("--currency <currency>", "wallet currency")
    .option("--hmac-secret <secret>", "request signing secret")
    .option("--namespace <value>", "namespace used by the seed command")
    .option("--rounds <count>", "number of rounds")
    .option("--users <count>", "number of players");

  command.action(async (options: RunOptions) => {
    let config: RunConfig;
    try {
      config = parseRunConfig(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        command.error(z.prettifyError(error));
      }
      throw error;
    }

    console.log(await runGames(config));
  });
}

async function runGames(config: RunConfig) {
  const from = new Date(Date.now() - 1);
  let completedRounds = 0;
  let failedRounds = 0;
  let nextRound = 0;
  let totalBet = 0;
  let totalWin = 0;

  const worker = async () => {
    while (nextRound < config.rounds) {
      const round = generateRound(config, nextRound++);
      totalBet += round.totalBet;
      totalWin += round.totalWin;
      const succeeded = await executeRound(config, round);

      if (succeeded) {
        completedRounds += 1;
        console.log(`Game ${round.gameId} executed.`);
      } else {
        failedRounds += 1;
        console.log(`Game ${round.gameId} failed.`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(config.concurrency, config.rounds) }, worker),
  );

  console.log(
    `Executed ${String(completedRounds)} rounds (${String(failedRounds)} failed).`,
  );

  const observedRtp = totalBet === 0 ? 0 : totalWin / totalBet;
  console.log(`Expected RTP: ${(EXPECTED_RTP * 100).toFixed(2)}%`);
  console.log(`Observed RTP: ${(observedRtp * 100).toFixed(2)}%`);

  const to = new Date(Date.now() + 1);
  const casino = await verifyCasinoRtp(config, from, to);
  const users = await verifyUserRtp(config, from, to);

  return { casino, users };
}

async function executeRound(
  config: RunConfig,
  round: ReturnType<typeof generateRound>,
): Promise<boolean> {
  try {
    for (const [index, action] of round.actions.entries()) {
      const response = await sendProcessRequest(config, {
        actions: [action],
        currency: config.currency,
        finished: index === round.actions.length - 1,
        game: "game-runner",
        game_id: round.gameId,
        user_id: round.userId,
      });

      if (!response.ok) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
