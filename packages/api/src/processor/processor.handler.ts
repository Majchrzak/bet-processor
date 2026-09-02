import "zod/compile";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  ProcessorRequestSchema,
  type ProcessorRequest,
} from "./contract/processor.request";
import type { ProcessorRepository } from "./processor.repository";

export function createProcessHandler(repository: ProcessorRepository) {
  return {
    async handle(
      request: FastifyRequest<{ Body: ProcessorRequest }>,
      reply: FastifyReply,
    ) {
      const payload = ProcessorRequestSchema.safeParse(request.body);
      if (!payload.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const body = payload.data;

      try {
        const response = body.actions?.length
          ? await repository.process(body)
          : await repository.getBalance(body);
        return response === undefined
          ? await reply.code(404).send({ message: "Wallet not found" })
          : await reply.send(response);
      } catch (error) {
        switch (databaseErrorCode(error)) {
          case "BP001":
            return reply.code(404).send({ message: "Wallet not found" });
          case "BP002":
            return reply.code(400).send({
              code: 100,
              message: "Player has not enough funds to process an action",
            });
          case "BP003":
            return reply
              .code(409)
              .send({ message: "Game is already finished" });
          default:
            throw error;
        }
      }
    },
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
