export const PAYOUTS = [
  { probability: 0.6, multiplier: 0 },
  { probability: 0.25, multiplier: 1 },
  { probability: 0.1, multiplier: 2 },
  { probability: 0.04, multiplier: 5 },
  { probability: 0.01, multiplier: 30 },
] as const;

export const EXPECTED_RTP = 0.95;
const MIN_RTP_TOLERANCE = 0.01;
const CONFIDENCE_STANDARD_DEVIATIONS = 3;

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

export function getRtpTolerance(rounds: number): number {
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error("Rounds must be a positive integer");
  }

  const variance = PAYOUTS.reduce(
    (sum, payout) =>
      sum + payout.probability * (payout.multiplier - EXPECTED_RTP) ** 2,
    0,
  );

  return Math.max(
    MIN_RTP_TOLERANCE,
    CONFIDENCE_STANDARD_DEVIATIONS * Math.sqrt(variance / rounds),
  );
}
