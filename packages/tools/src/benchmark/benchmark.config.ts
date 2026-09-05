import { z } from "zod";

const BenchmarkConfigSchema = z
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
    duration: z.coerce.number().positive().max(86_400).default(30),
    hmacSecret: z.string().min(1).default("development-hmac-secret"),
    namespace: z.string().min(1).optional(),
    playerCount: z.coerce.number().int().positive().default(1_000),
  })
  .strict();

export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

export function parseBenchmarkConfig(
  options: Readonly<{
    apiUrl?: string;
    concurrency?: string;
    currency?: string;
    duration?: string;
    hmacSecret?: string;
    namespace?: string;
    users?: string;
  }>,
) {
  return BenchmarkConfigSchema.parse({
    apiUrl: options.apiUrl,
    concurrency: options.concurrency,
    currency: options.currency,
    duration: options.duration,
    hmacSecret: options.hmacSecret,
    namespace: options.namespace,
    playerCount: options.users,
  });
}
