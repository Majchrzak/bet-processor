import "zod/compile";
import type { Context } from "hono";
import type { DataSource } from "typeorm";

import { config } from "../config";
import { type TimeProvider } from "../time";
import {
  isProcessActionsRequest,
  ProcessorRequestSchema,
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
  TooManyActionsMessage,
  WalletNotFoundMessage,
} from "../error";

export function createProcessHandler(
  dataSource: DataSource,
  timeProvider: TimeProvider,
) {
  const repository = createProcessorRepository(dataSource, timeProvider);
  const { BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST } = config();

  return async (context: Context<{ Variables: { requestBody: unknown } }>) => {
    const payload = ProcessorRequestSchema.safeParse(
      context.get("requestBody"),
    );

    if (!payload.success) {
      return context.json(InvalidRequestMessage, 400);
    }

    const body = payload.data;

    if (
      isProcessActionsRequest(body) &&
      body.actions.length > BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST
    ) {
      return context.json(TooManyActionsMessage, 400);
    }

    try {
      const response = isProcessActionsRequest(body)
        ? await repository.process(body)
        : await repository.getBalance(body);

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
