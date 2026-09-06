import { serve } from "@hono/node-server";
import pino from "pino";

import { buildApp } from "./app";
import { config } from "./config";
import { createDataSource } from "./database";

const { BET_PROCESSOR_HOST, BET_PROCESSOR_PORT, BET_PROCESSOR_LOG_LEVEL } =
  config();

const log = pino({ level: BET_PROCESSOR_LOG_LEVEL });

const dataSource = createDataSource();
await dataSource.initialize();

const app = buildApp(log, dataSource);

const server = serve({
  fetch: app.fetch,
  hostname: BET_PROCESSOR_HOST,
  port: BET_PROCESSOR_PORT,
});

const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
  log.info({ signal }, "shutting down");

  server.close((serverError) => {
    void dataSource.destroy().catch((databaseError: unknown) => {
      log.error(databaseError, "failed to close database");
      process.exitCode = 1;
    });

    if (serverError) {
      log.error(serverError, "failed to close server");
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", () => {
  shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});
