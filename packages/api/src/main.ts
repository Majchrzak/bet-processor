import type { FastifyInstance } from "fastify";

import { buildApp } from "./app";
import { config } from "./config";

export async function startServer(): Promise<FastifyInstance> {
  const app = buildApp();
  let shutdownPromise: Promise<void> | undefined;

  const removeShutdownHandlers = (): void => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };

  const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
    if (shutdownPromise) {
      return;
    }

    app.log.info({ signal }, "shutting down");
    removeShutdownHandlers();
    shutdownPromise = app.close().catch((error: unknown) => {
      app.log.error(error, "graceful shutdown failed");
    });
  };

  const onSigint = () => {
    shutdown("SIGINT");
  };
  const onSigterm = () => {
    shutdown("SIGTERM");
  };

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const { BET_PROCESSOR_HOST, BET_PROCESSOR_PORT } = config();

  try {
    await app.listen({
      host: BET_PROCESSOR_HOST,
      port: BET_PROCESSOR_PORT,
    });
  } catch (error) {
    removeShutdownHandlers();
    app.log.error(error, "failed to start server");
    await app.close();
    throw error;
  }

  return app;
}

try {
  await startServer();
} catch {
  process.exitCode = 1;
}
