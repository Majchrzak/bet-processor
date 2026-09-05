import type { Command } from "commander";
import { Pool } from "pg";
import { z } from "zod";

import { createSeedUserId, createWalletId, userIdPrefix } from "../identifiers";
import { parseSeedConfig, type SeedConfig } from "./seed.config";

type SeedOptions = Parameters<typeof parseSeedConfig>[0];

export function registerSeedCommand(program: Command): void {
  const seedCommand = program
    .command("seed")
    .description("idempotently seed deterministic wallets")
    .option("--database-url <url>", "PostgreSQL connection URL")
    .option("--currency <currency>", "wallet currency")
    .option("--users <count>", "number of player wallets")
    .option("--balance <minor-units>", "initial wallet balance in minor units")
    .option("--namespace <value>", "deterministic user namespace");

  seedCommand.action(async (options: SeedOptions) => {
    let config: SeedConfig;
    try {
      config = parseSeedConfig(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        seedCommand.error(z.prettifyError(error));
      }
      throw error;
    }

    const result = await runSeedCommand(config);
    const message = `Seeded ${String(result.walletCount)} ${result.currency} wallets with prefix ${JSON.stringify(result.userIdPrefix)} and balance ${String(result.balance)}.`;

    console.log(message);
  });
}

export async function runSeedCommand(config: SeedConfig) {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });

  try {
    const seededAt = new Date();

    const ids = Array.from({ length: config.playerCount }, (_, index) =>
      createWalletId(
        createSeedUserId(index + 1, config.namespace),
        config.currency,
      ),
    );

    await pool.query(
      `
      INSERT INTO wallet (id, balance, created_at, updated_at)
      SELECT wallet_id, $2, $3, $3
      FROM unnest($1::uuid[]) AS wallet_id
      ON CONFLICT (id) DO UPDATE
      SET balance = EXCLUDED.balance,
          updated_at = EXCLUDED.updated_at
    `,
      [ids, config.playerBalance, seededAt],
    );

    return {
      balance: config.playerBalance,
      currency: config.currency,
      userIdPrefix: userIdPrefix(config.namespace),
      walletCount: config.playerCount,
    };
  } finally {
    await pool.end();
  }
}
