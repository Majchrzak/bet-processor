import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { buildApp } from "./app";

const apps: ReturnType<typeof buildApp>[] = [];

beforeAll(() => {
  vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", "test-secret");
  vi.stubEnv("BET_PROCESSOR_LOG_LEVEL", "silent");
  vi.stubEnv("BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES", "8");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe(buildApp.name, () => {
  it("keeps the health endpoint public", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("enforces the configured request body limit", async () => {
    const app = buildApp();
    app.post("/payload", () => ({ accepted: true }));
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/payload",
      payload: { value: "too large" },
    });

    expect(response.statusCode).toBe(413);
  });
});
