import "zod/compile";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";

import { type TimeProvider } from "../time";
import {
  ProcessorRequestSchema,
  type ProcessorRequest,
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

  return async (
    request: FastifyRequest<{ Body: ProcessorRequest }>,
    reply: FastifyReply,
  ) => {
    const payload = ProcessorRequestSchema.safeParse(request.body);

    if (!payload.success) {
      return reply.code(400).send(InvalidRequestMessage);
    }

    const body = payload.data;

    try {
      const response = body.actions?.length
        ? await repository.process(body)
        : await repository.getBalance(body);

      if (!response) {
        return await reply.code(404).send(WalletNotFoundMessage);
      }

      return await reply.send(response);
    } catch (error) {
      switch (databaseErrorCode(error)) {
        case WalletNotFoundDatabaseError:
          return reply.code(404).send(WalletNotFoundMessage);
        case InsufficientFundsDatabaseError:
          return reply.code(400).send(InsufficientFundsMessage);
        case GameAlreadyFinishedDatabaseError:
          return reply.code(400).send(GameAlreadyFinishedMessage);
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
