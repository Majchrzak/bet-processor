import { randomUUID } from "node:crypto";

import type { Command } from "commander";
import { z } from "zod";

import { sendProcessRequest } from "../api";
import { createSeedUserId } from "../identifiers";
import { parseBenchmarkConfig, type BenchmarkConfig } from "./benchmark.config";

type BenchmarkOptions = Parameters<typeof parseBenchmarkConfig>[0];

export function registerBenchmarkCommand(program: Command): void {
  const command = program
    .command("benchmark")
    .description("benchmark signed game-round ingestion")
    .option("--api-url <url>", "bet processor API URL")
    .option("--concurrency <count>", "number of concurrent workers")
    .option("--currency <currency>", "wallet currency")
    .option("--duration <seconds>", "measurement duration in seconds")
    .option("--hmac-secret <secret>", "request signing secret")
    .option("--namespace <value>", "seeded user namespace")
    .option("--users <count>", "number of seeded player wallets");

  command.action(async (options: BenchmarkOptions) => {
    let config: BenchmarkConfig;
    try {
      config = parseBenchmarkConfig(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        command.error(z.prettifyError(error));
      }
      throw error;
    }

    console.log(await runBenchmark(config));
  });
}

async function runBenchmark(config: BenchmarkConfig) {
  const deadline = performance.now() + config.duration * 1_000;
  const runId = `benchmark-${String(Date.now())}`;
  let requests = 0;
  let sequence = 0;
  let totalTimeMs = 0;

  const worker = async () => {
    while (performance.now() < deadline) {
      const requestSequence = sequence++;
      const startedAt = performance.now();

      await sendBenchmarkRequest(config, requestSequence, runId);

      totalTimeMs += performance.now() - startedAt;
      requests += 1;
    }
  };

  await Promise.all(Array.from({ length: config.concurrency }, worker));

  return {
    averageTimeMs:
      requests === 0 ? 0 : Number((totalTimeMs / requests).toFixed(3)),
    requests,
  };
}

async function sendBenchmarkRequest(
  config: BenchmarkConfig,
  sequence: number,
  runId: string,
): Promise<void> {
  const response = await sendProcessRequest(config, {
    actions: [
      { action: "bet", action_id: randomUUID(), amount: 100 },
      { action: "win", action_id: randomUUID(), amount: 95 },
    ],
    currency: config.currency,
    finished: true,
    game: "benchmark",
    game_id: `${runId}-round-${String(sequence)}`,
    user_id: createSeedUserId(
      (sequence % config.playerCount) + 1,
      config.namespace,
    ),
  });

  if (!response.ok) {
    throw new Error(`Benchmark request failed with ${String(response.status)}`);
  }
}
