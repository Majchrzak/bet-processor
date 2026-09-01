import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "./app";
import { createHmacSha256Digest } from "./hmac";

const secret = "test-secret";

describe(buildApp.name, () => {
  let fixtures: Awaited<ReturnType<typeof getFixtures>>;

  beforeAll(async () => {
    vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", secret);
    vi.stubEnv("BET_PROCESSOR_LOG_LEVEL", "silent");
    vi.stubEnv("BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES", "64");
    fixtures = await getFixtures();
  });

  afterAll(async () => {
    await fixtures.dispose();
    vi.unstubAllEnvs();
  });

  it("keeps the health endpoint public", async () => {
    const response = await fixtures.when.health();

    fixtures.then.responded(response, 200, { status: "ok" });
  });

  it("enforces the configured request body limit", async () => {
    const response = await fixtures.when.postPayload({
      value: "x".repeat(65),
    });

    expect(response.statusCode).toBe(413);
  });

  describe("raw-body HMAC authentication", () => {
    it("accepts a known signature over the exact raw JSON bytes", async () => {
      const body = '{\n  "value": 1\n}';

      const response = await fixtures.when.process(
        fixtures.given.signedJson(body),
      );

      fixtures.then.responded(response, 200, { value: 1 });
    });

    it("rejects a signature for semantically equal bytes with different whitespace", async () => {
      const signedBody = '{"value":1}';
      const transmittedBody = '{ "value": 1 }';

      const response = await fixtures.when.process(
        fixtures.given.signedJson(transmittedBody, signedBody),
      );

      fixtures.then.forbidden(response);
    });

    it.each([undefined, "Bearer invalid", "HMAC-SHA256 invalid"])(
      "returns the same response for a missing or malformed header: %s",
      async (authorization) => {
        const response = await fixtures.when.process({
          authorization,
          body: '{"value":1}',
        });

        fixtures.then.forbidden(response);
      },
    );

    it.each(["/reports/rtp/users", "/reports/rtp/casino"])(
      "authenticates a bodyless report request to %s using empty bytes",
      async (url) => {
        const response = await fixtures.when.report(
          url,
          fixtures.given.authorization(Buffer.alloc(0)),
        );

        expect(response.statusCode).toBe(200);
      },
    );

    it("keeps health public even when authorization is absent", async () => {
      const response = await fixtures.when.health();

      expect(response.statusCode).toBe(200);
    });
  });
});

async function getFixtures() {
  const app = buildApp();

  app.post("/payload", () => ({ accepted: true }));
  app.post("/aggregator/takehome/process", (request) => request.body);
  app.get("/reports/rtp/users", () => ({ report: "users" }));
  app.get("/reports/rtp/casino", () => ({ report: "casino" }));

  await app.ready();

  return {
    given: {
      authorization(body: string | Buffer): string {
        return `HMAC-SHA256 ${createHmacSha256Digest(body, secret)}`;
      },

      signedJson(body: string, signedBody = body) {
        return {
          authorization: this.authorization(signedBody),
          body,
        };
      },
    },

    when: {
      async health() {
        return await app.inject({ method: "GET", url: "/health" });
      },

      async postPayload(payload: object) {
        return await app.inject({
          method: "POST",
          url: "/payload",
          payload,
        });
      },

      async process(request: {
        authorization?: string | undefined;
        body: string;
      }) {
        return await app.inject({
          method: "POST",
          url: "/aggregator/takehome/process",
          headers: {
            ...(request.authorization === undefined
              ? {}
              : { authorization: request.authorization }),
            "content-type": "application/json",
          },
          payload: request.body,
        });
      },

      async report(url: string, authorization: string) {
        return await app.inject({
          method: "GET",
          url,
          headers: { authorization },
        });
      },
    },

    then: {
      responded(
        response: LightMyRequestResponse,
        statusCode: number,
        body: unknown,
      ) {
        expect(response.statusCode).toBe(statusCode);
        expect(response.json()).toEqual(body);
      },

      forbidden(response: LightMyRequestResponse) {
        this.responded(response, 403, { message: "Forbidden" });
      },
    },

    async dispose() {
      await app.close();
    },
  };
}
