import { z } from "zod";

const RunConfigSchema = z
  .object({
    apiUrl: z
      .url()
      .refine(
        (value) => value.startsWith("http://") || value.startsWith("https://"),
        "API URL must use the http or https protocol",
      )
      .default("http://localhost:3000")
      .transform((value) => value.replace(/\/$/u, "")),
    concurrency: z.coerce.number().int().min(1).max(1_000).default(10),
    currency: z.string().trim().min(1).max(16).default("USD"),
    hmacSecret: z.string().min(1).default("development-hmac-secret"),
    maxBets: z.coerce.number().int().min(1).max(100).default(3),
    maxWins: z.coerce.number().int().min(1).max(100).default(3),
    namespace: z.string().min(1).optional(),
    rounds: z.coerce.number().int().positive().default(10_000),
    users: z.coerce.number().int().positive().default(1_000),
  })
  .strict();

export type RunConfig = z.infer<typeof RunConfigSchema>;

export function parseRunConfig(
  options: Readonly<{
    apiUrl?: string;
    concurrency?: string;
    currency?: string;
    hmacSecret?: string;
    maxBets?: string;
    maxWins?: string;
    namespace?: string;
    rounds?: string;
    users?: string;
  }>,
) {
  return RunConfigSchema.parse({
    apiUrl: options.apiUrl,
    concurrency: options.concurrency,
    currency: options.currency,
    hmacSecret: options.hmacSecret,
    maxBets: options.maxBets,
    maxWins: options.maxWins,
    namespace: options.namespace,
    rounds: options.rounds,
    users: options.users,
  });
}
