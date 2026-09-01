import Fastify, { type FastifyInstance } from "fastify";

import { config } from "./config";

export function buildApp(): FastifyInstance {
  const { BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES, BET_PROCESSOR_LOG_LEVEL } =
    config();

  const app = Fastify({
    bodyLimit: BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES,
    logger: { level: BET_PROCESSOR_LOG_LEVEL },
  });

  app.get("/health", () => ({ status: "ok" as const }));

  return app;
}
