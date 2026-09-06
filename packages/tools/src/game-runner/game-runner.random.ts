import { createHash } from "node:crypto";

import type { RandomGenerator } from "./game-runner.payout";

const UINT32_RANGE = 2 ** 32;

function rollFromNamespacedRound(
  namespace: string,
  roundIndex: number,
): number {
  const hash = createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(roundIndex.toString())
    .digest();

  return hash.readUInt32BE(0) / UINT32_RANGE;
}

export function rollFromRound(
  namespace: string | undefined,
  roundIndex: number,
): number | undefined {
  if (!namespace) {
    return undefined;
  }

  return rollFromNamespacedRound(namespace, roundIndex);
}

export function createRoundRandom(
  namespace: string | undefined,
  roundIndex: number,
): RandomGenerator {
  if (!namespace) {
    return { next: () => Math.random() };
  }

  const roll = rollFromNamespacedRound(namespace, roundIndex);

  return { next: () => roll };
}
