import { Pool } from "pg";

import {
  createSeedUserId,
  createWalletId,
  userIdPrefix,
} from "../identifiers";
import type { SeedConfig } from "./seed.config";

export async function runSeedCommand(config: SeedConfig) {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });

  try {
    return await seedDatabase(pool, config);
  } finally {
    await pool.end();
  }
}

async function seedDatabase(pool: Pool, config: SeedConfig) {
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
}
