import { describe, expect, expectTypeOf, it } from "vitest";

import { parseConfig, type Config } from "./config";

const defaults = {
  BET_PROCESSOR_DATABASE_URL:
    "postgresql://postgres:development-db-password@localhost:5432/bet_processor",
  BET_PROCESSOR_DB_POOL_SIZE: 90,
  BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: 30_000,
  BET_PROCESSOR_HMAC_SECRET: "development-hmac-secret",
  BET_PROCESSOR_HOST: "0.0.0.0",
  BET_PROCESSOR_LOG_LEVEL: "warn",
  BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: 1_000,
  BET_PROCESSOR_PORT: 3_000,
  BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: 1024 * 1024,
  BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 3_660,
} satisfies Config;

describe(parseConfig.name, () => {
  describe("happy path", () => {
    it("provides bounded local defaults", () => {
      const parsedConfig = parseConfig({});

      expectTypeOf(parsedConfig).toEqualTypeOf<Config>();
      expect(parsedConfig).toEqual(defaults);
    });

    it("coerces validated environment overrides", () => {
      const parsedConfig = parseConfig({
        BET_PROCESSOR_DATABASE_URL: "postgres://app:secret@database:5432/app",
        BET_PROCESSOR_DB_POOL_SIZE: "25",
        BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: "2500",
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_HOST: "127.0.0.1",
        BET_PROCESSOR_LOG_LEVEL: "debug",
        BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: "200",
        BET_PROCESSOR_PORT: "8080",
        BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: "2048",
        BET_PROCESSOR_RTP_MAX_RANGE_DAYS: "31",
      });

      expect(parsedConfig).toMatchObject({
        BET_PROCESSOR_DB_POOL_SIZE: 25,
        BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: 2_500,
        BET_PROCESSOR_LOG_LEVEL: "debug",
        BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: 200,
        BET_PROCESSOR_PORT: 8_080,
        BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: 2_048,
        BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 31,
      });
    });
  });
});
