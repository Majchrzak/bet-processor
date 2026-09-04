import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { config } from "./config";
import { createDataSource } from "./database";
import { verifyHmacSha256Authorization } from "./hmac";
import { createProcessHandler } from "./processor/processor.handler";
import { createCasinoRtpHandler } from "./rtp-casino/rtp-casino.handler";
import { createUserRtpHandler } from "./rtp-users/rtp-users.handler";
import { systemTimeProvider } from "./time";

const EMPTY_BODY = Buffer.alloc(0);
const rawRequestBodies = new WeakMap<FastifyRequest, Buffer>();

const protectedRoutePaths = new Set([
  "/aggregator/takehome/process",
  "/reports/rtp/users",
  "/reports/rtp/casino",
]);

function isProtectedRoute(request: FastifyRequest): boolean {
  const routePath = request.routeOptions.url;
  return routePath !== undefined && protectedRoutePaths.has(routePath);
}

function isAuthorized(request: FastifyRequest, secret: string): boolean {
  return verifyHmacSha256Authorization(
    rawRequestBodies.get(request) ?? EMPTY_BODY,
    secret,
    request.headers.authorization,
  );
}

export function buildApp(): FastifyInstance {
  const {
    BET_PROCESSOR_HMAC_SECRET,
    BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES,
    BET_PROCESSOR_LOG_LEVEL,
  } = config();

  const app = Fastify({
    bodyLimit: BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES,
    logger: { level: BET_PROCESSOR_LOG_LEVEL },
  });

  const dataSource = createDataSource();

  app.addHook("onReady", async () => {
    await dataSource.initialize();
  });

  app.addHook("onClose", async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  app.addHook("preValidation", (request, reply, done) => {
    if (
      !isProtectedRoute(request) ||
      isAuthorized(request, BET_PROCESSOR_HMAC_SECRET)
    ) {
      done();
    } else {
      reply.code(403).send({ message: "Forbidden" });
    }
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      const rawBody = typeof body === "string" ? Buffer.from(body) : body;
      rawRequestBodies.set(request, rawBody);

      try {
        done(null, JSON.parse(rawBody.toString("utf8")) as unknown);
      } catch (error) {
        done(error as Error);
      }
    },
  );

  app.get("/health", () => ({ status: "ok" as const }));
  app.get("/reports/rtp/users", createUserRtpHandler(dataSource));
  app.get("/reports/rtp/casino", createCasinoRtpHandler(dataSource));
  app.post(
    "/aggregator/takehome/process",
    createProcessHandler(dataSource, systemTimeProvider),
  );

  return app;
}
