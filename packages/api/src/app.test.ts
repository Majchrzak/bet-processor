import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dataSource } = vi.hoisted(() => ({
  dataSource: {
    destroy: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: false,
    query: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("./database", () => ({ createDataSource: () => dataSource }));

import { buildApp } from "./app";
import { createHmacSha256Digest } from "./hmac";

const secret = "test-secret";

describe("RTP route registration", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", secret);
    vi.stubEnv("BET_PROCESSOR_LOG_LEVEL", "silent");
    vi.stubEnv("BET_PROCESSOR_RTP_MAX_RANGE_DAYS", "31");

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each(["/reports/rtp/users", "/reports/rtp/casino"])(
    "protects bodyless GET %s with an HMAC over empty bytes",
    async (path) => {
      const query =
        "?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z";
      const forbidden = await app.inject({ method: "GET", url: path + query });
      const authorized = await app.inject({
        method: "GET",
        url: path + query,
        headers: {
          authorization: `HMAC-SHA256 ${createHmacSha256Digest("", secret)}`,
        },
      });

      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ message: "Forbidden" });
      expect(authorized.statusCode).toBe(200);
      expect(authorized.json()).toMatchObject({ data: [] });
    },
  );
});
