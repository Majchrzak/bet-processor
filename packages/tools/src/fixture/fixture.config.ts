import { z } from "zod";

const FixtureConfigSchema = z
  .object({
    batchGames: z.coerce.number().int().positive().default(100_000),
    clean: z.boolean().default(false),
    currency: z.string().trim().min(1).max(16).default("USD"),
    databaseUrl: z
      .url()
      .refine(
        (value) =>
          value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "database URL must use the postgres or postgresql protocol",
      )
      .default(
        "postgresql://postgres:development-db-password@localhost:5432/bet_processor",
      ),
    days: z.coerce.number().int().positive().default(365),
    gameCount: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
    namespace: z.string().min(1).optional(),
    playerCount: z.coerce.number().int().positive().default(1_000),
  })
  .strict();

export type FixtureConfig = z.infer<typeof FixtureConfigSchema>;

export function parseFixtureConfig(
  options: Readonly<{
    batchGames?: string;
    clean?: boolean;
    currency?: string;
    databaseUrl?: string;
    days?: string;
    games?: string;
    namespace?: string;
    users?: string;
  }>,
) {
  return FixtureConfigSchema.parse({
    batchGames: options.batchGames,
    clean: options.clean,
    currency: options.currency,
    databaseUrl: options.databaseUrl,
    days: options.days,
    gameCount: options.games,
    namespace: options.namespace,
    playerCount: options.users,
  });
}
