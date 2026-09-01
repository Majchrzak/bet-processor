import { z } from "zod";

export const LogLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

export const ConfigSchema = z
  .object({
    BET_PROCESSOR_DATABASE_URL: z
      .url()
      .refine(
        (value) =>
          value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "BET_PROCESSOR_DATABASE_URL must use the postgres or postgresql protocol",
      )
      .default("postgresql://postgres:postgres@localhost:5432/bet_processor"),
    BET_PROCESSOR_DB_POOL_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000)
      .default(10),
    BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3_600_000)
      .default(30_000),
    BET_PROCESSOR_HMAC_SECRET: z.string().min(1),
    BET_PROCESSOR_HOST: z.string().min(1).default("0.0.0.0"),
    BET_PROCESSOR_LOG_LEVEL: LogLevelSchema.default("info"),
    BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(1_000),
    BET_PROCESSOR_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(3_000),
    BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .default(1024 * 1024),
    BET_PROCESSOR_RTP_MAX_RANGE_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3_660)
      .default(3_660),
  })
  .strip();

export type Config = Readonly<z.infer<typeof ConfigSchema>>;

let cachedConfig: Config | undefined;

export function parseConfig(environment: NodeJS.ProcessEnv): Config {
  return ConfigSchema.parse(environment);
}

export function config(): Readonly<Config> {
  return (cachedConfig ??= parseConfig(process.env));
}
