import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { Logger } from "pino";

import { config } from "./config";
import { verifyHmacSha256Authorization } from "./hmac";
import { createProcessHandler } from "./processor/processor.handler";
import { createCasinoRtpHandler } from "./rtp-casino/rtp-casino.handler";
import { createUserRtpHandler } from "./rtp-users/rtp-users.handler";
import { systemTimeProvider } from "./time";
import {
  ForbiddenMessage,
  InternalServerErrorMessage,
  InvalidRequestMessage,
  RequestBodyTooLargeMessage,
} from "./error";
import { DataSource } from "typeorm";

const EMPTY_BODY = new Uint8Array();

export function buildApp(log: Logger, dataSource: DataSource) {
  const { BET_PROCESSOR_HMAC_SECRET, BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES } =
    config();

  const app = new Hono<{ Variables: { requestBody?: unknown } }>();

  app.onError((error, context) => {
    log.error(error, "request failed");

    return context.json(InternalServerErrorMessage, 500);
  });

  app.use(
    "/aggregator/takehome/process",
    bodyLimit({
      maxSize: BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES,
      onError: (context) => context.json(RequestBodyTooLargeMessage, 413),
    }),
  );

  app.use("*", async (context, next) => {
    switch (context.req.path) {
      case "/aggregator/takehome/process":
      case "/reports/rtp/users":
      case "/reports/rtp/casino":
        break;
      default:
        return next();
    }

    const rawBody =
      context.req.method === "GET"
        ? EMPTY_BODY
        : new Uint8Array(await context.req.raw.arrayBuffer());

    if (
      !verifyHmacSha256Authorization(
        rawBody,
        BET_PROCESSOR_HMAC_SECRET,
        context.req.header("authorization"),
      )
    ) {
      return context.json(ForbiddenMessage, 403);
    }

    if (context.req.method === "POST") {
      try {
        context.set(
          "requestBody",
          JSON.parse(Buffer.from(rawBody).toString("utf8")) as unknown,
        );
      } catch {
        return context.json(InvalidRequestMessage, 400);
      }
    }

    return next();
  });

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.get("/reports/rtp/users", createUserRtpHandler(dataSource));
  app.get("/reports/rtp/casino", createCasinoRtpHandler(dataSource));
  app.post(
    "/aggregator/takehome/process",
    createProcessHandler(dataSource, systemTimeProvider),
  );

  return app;
}
