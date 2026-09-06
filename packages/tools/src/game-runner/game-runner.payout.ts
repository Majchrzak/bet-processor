export const PAYOUTS = [
  { probability: 0.6, multiplier: 0 },
  { probability: 0.25, multiplier: 1 },
  { probability: 0.1, multiplier: 2 },
  { probability: 0.04, multiplier: 5 },
  { probability: 0.01, multiplier: 30 },
] as const;

export const EXPECTED_RTP = 0.95;

export interface RandomGenerator {
  next(): number;
}

export function generateMultiplier(random: RandomGenerator): number {
  const roll = random.next();

  let cumulativeProbability = 0;

  for (const payout of PAYOUTS) {
    cumulativeProbability += payout.probability;

    if (roll < cumulativeProbability) {
      return payout.multiplier;
    }
  }

  throw new Error("Invalid payout distribution");
}
