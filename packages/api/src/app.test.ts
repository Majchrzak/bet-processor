import pino from "pino";
import type { DataSource } from "typeorm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "./app";
import { ForbiddenMessage, InvalidRequestMessage } from "./error";
import { createHmacSha256Digest } from "./hmac";

describe(buildApp.name, () => {
  let fixtures: ReturnType<typeof getFixtures>;

  beforeEach(() => {
    fixtures = getFixtures();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("happy path", () => {
    it("/health", async () => {
      const response = await fixtures.when.get("/health");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });

    it.each(["/reports/rtp/users", "/reports/rtp/casino"])(
      "protects GET %s with an HMAC over empty bytes",
      async (path) => {
        const REPORT_QUERY =
          "?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z";

        const forbidden = await fixtures.when.get(path + REPORT_QUERY);
        const authorized = await fixtures.when.get(path + REPORT_QUERY, true);

        expect(forbidden.status).toBe(403);
        expect(await forbidden.json()).toEqual(ForbiddenMessage);
        expect(authorized.status).toBe(200);
        expect(await authorized.json()).toMatchObject({ data: [] });
      },
    );
  });

  it("verifies a POST signature against the exact request bytes", async () => {
    const body = "{invalid-json";
    const authorized = await fixtures.when.post(body);
    const forbidden = await fixtures.when.post(body, `${body} `);

    expect(authorized.status).toBe(400);
    expect(await authorized.json()).toEqual(InvalidRequestMessage);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual(ForbiddenMessage);
  });
});

function getFixtures() {
  const SECRET = "test-secret";

  vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", SECRET);

  const query = vi.fn().mockResolvedValue([]);
  const dataSource = { query } as unknown as DataSource;
  const app = buildApp(pino({ level: "silent" }), dataSource);

  const authorization = (body: string) =>
    `HMAC-SHA256 ${createHmacSha256Digest(body, SECRET)}`;

  return {
    when: {
      get(path: string, authorized = false) {
        return app.request(
          path,
          authorized
            ? { headers: { authorization: authorization("") } }
            : undefined,
        );
      },
      post(body: string, signedBody = body) {
        return app.request("/aggregator/takehome/process", {
          method: "POST",
          headers: {
            authorization: authorization(signedBody),
            "content-type": "application/json",
          },
          body,
        });
      },
    },
  };
}
