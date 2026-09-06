import "zod/compile";
import type { Context } from "hono";
import type { DataSource } from "typeorm";

import { type TimeProvider } from "../time";
import {
  ProcessorRequestSchema,
  isProcessActionsRequest,
} from "./contract/processor.request";
import {
  createProcessorRepository,
  GameAlreadyFinishedDatabaseError,
  InsufficientFundsDatabaseError,
  WalletNotFoundDatabaseError,
} from "./processor.repository";
import {
  GameAlreadyFinishedMessage,
  InsufficientFundsMessage,
  InvalidRequestMessage,
  WalletNotFoundMessage,
} from "../error";

export function createProcessHandler(
  dataSource: DataSource,
  timeProvider: TimeProvider,
) {
  const repository = createProcessorRepository(dataSource, timeProvider);

  return async (context: Context<{ Variables: { requestBody: unknown } }>) => {
    const payload = ProcessorRequestSchema.safeParse(
      context.get("requestBody"),
    );

    if (!payload.success) {
      return context.json(InvalidRequestMessage, 400);
    }

    try {
      const response = isProcessActionsRequest(payload.data)
        ? await repository.process(payload.data)
        : await repository.getBalance(payload.data);

      if (!response) {
        return context.json(WalletNotFoundMessage, 404);
      }

      return context.json(response);
    } catch (error) {
      switch (databaseErrorCode(error)) {
        case WalletNotFoundDatabaseError:
          return context.json(WalletNotFoundMessage, 404);
        case InsufficientFundsDatabaseError:
          return context.json(InsufficientFundsMessage, 400);
        case GameAlreadyFinishedDatabaseError:
          return context.json(GameAlreadyFinishedMessage, 400);
        default:
          throw error;
      }
    }
  };
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const driverCode =
    isRecord(error.driverError) && typeof error.driverError.code === "string"
      ? error.driverError.code
      : undefined;

  return (
    driverCode ?? (typeof error.code === "string" ? error.code : undefined)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
