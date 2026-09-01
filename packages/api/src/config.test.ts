import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import { config, parseConfig, type Config } from "./config";

describe(parseConfig.name, () => {
  it("provides bounded local defaults while requiring an HMAC secret", () => {
    const parsedConfig = parseConfig({
      BET_PROCESSOR_HMAC_SECRET: "development-secret",
    });

    expectTypeOf(parsedConfig).toEqualTypeOf<Config>();
    expect(parsedConfig).toEqual({
      BET_PROCESSOR_DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/bet_processor",
      BET_PROCESSOR_DB_POOL_SIZE: 10,
      BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: 30_000,
      BET_PROCESSOR_HMAC_SECRET: "development-secret",
      BET_PROCESSOR_HOST: "0.0.0.0",
      BET_PROCESSOR_LOG_LEVEL: "info",
      BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: 1_000,
      BET_PROCESSOR_PORT: 3_000,
      BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: 1024 * 1024,
      BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 3_660,
    });
  });

  it("coerces validated environment overrides", () => {
    expect(
      parseConfig({
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
      }),
    ).toMatchObject({
      BET_PROCESSOR_DB_POOL_SIZE: 25,
      BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: 2_500,
      BET_PROCESSOR_LOG_LEVEL: "debug",
      BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: 200,
      BET_PROCESSOR_PORT: 8_080,
      BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: 2_048,
      BET_PROCESSOR_RTP_MAX_RANGE_DAYS: 31,
    });
  });

  it.each<[NodeJS.ProcessEnv, string]>([
    [{}, "missing HMAC secret"],
    [{ BET_PROCESSOR_HMAC_SECRET: "" }, "empty HMAC secret"],
    [
      {
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_DATABASE_URL: "https://example.com",
      },
      "database protocol",
    ],
    [
      { BET_PROCESSOR_HMAC_SECRET: "secret", BET_PROCESSOR_DB_POOL_SIZE: "0" },
      "pool size",
    ],
    [
      {
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS: "0",
      },
      "statement timeout",
    ],
    [
      {
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_LOG_LEVEL: "verbose",
      },
      "log level",
    ],
    [
      {
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST: "0",
      },
      "action limit",
    ],
    [
      { BET_PROCESSOR_HMAC_SECRET: "secret", BET_PROCESSOR_PORT: "65536" },
      "port",
    ],
    [
      {
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES: "0",
      },
      "body limit",
    ],
    [
      {
        BET_PROCESSOR_HMAC_SECRET: "secret",
        BET_PROCESSOR_RTP_MAX_RANGE_DAYS: "3661",
      },
      "report range",
    ],
  ])("rejects invalid configuration: %s (%s)", (environment) => {
    expect(() => parseConfig(environment)).toThrow(z.ZodError);
  });
});

describe(config.name, () => {
  it("parses process.env once and returns the memoized object", () => {
    vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", "first-secret");
    const first = config();

    vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", "changed-secret");
    const second = config();
    vi.unstubAllEnvs();

    expect(second).toBe(first);
    expect(second.BET_PROCESSOR_HMAC_SECRET).toBe("first-secret");
  });
});
