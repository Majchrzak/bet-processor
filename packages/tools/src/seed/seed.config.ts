import { z } from "zod";

const SeedConfigSchema = z
  .object({
    currency: z.string().trim().min(1).max(16).default("USD"),
    databaseUrl: z
      .url()
      .refine(
        (value) =>
          value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "database URL must use the postgres or postgresql protocol",
      )
      .default("postgresql://postgres:postgres@localhost:5432/bet_processor"),
    playerBalance: z.coerce.number().int().positive().default(100_000_000),
    playerCount: z.coerce.number().int().positive().default(1_000),
    namespace: z.string().min(1).optional(),
  })
  .strict();

export type SeedConfig = z.infer<typeof SeedConfigSchema>;

export function parseSeedConfig(
  options: Readonly<{
    balance?: string;
    currency?: string;
    databaseUrl?: string;
    namespace?: string;
    users?: string;
  }>,
) {
  return SeedConfigSchema.parse({
    currency: options.currency,
    databaseUrl: options.databaseUrl,
    playerBalance: options.balance,
    playerCount: options.users,
    namespace: options.namespace,
  });
}
