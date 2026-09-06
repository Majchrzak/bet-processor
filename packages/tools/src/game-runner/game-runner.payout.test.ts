import { describe, expect, it } from "vitest";

import {
  generateMultiplier,
  getRtpTolerance,
  PAYOUTS,
} from "./game-runner.payout";
import { BET_AMOUNT } from "./game-runner.round";

describe("PAYOUTS", () => {
  it("has an expected RTP of 95%", () => {
    const expectedRtp = PAYOUTS.reduce(
      (sum, payout) => sum + payout.probability * payout.multiplier,
      0,
    );

    expect(expectedRtp).toBeCloseTo(0.95);
  });

  it("has a valid probability distribution", () => {
    const probability = PAYOUTS.reduce(
      (sum, payout) => sum + payout.probability,
      0,
    );

    expect(probability).toBeCloseTo(1);
  });
});

describe(generateMultiplier.name, () => {
  it("converges toward the expected RTP", () => {
    const rounds = 1_000_000;

    let totalBet = 0;
    let totalWin = 0;

    for (let i = 0; i < rounds; i++) {
      const multiplier = generateMultiplier({ next: () => Math.random() });

      totalBet += BET_AMOUNT;
      totalWin += BET_AMOUNT * multiplier;
    }

    const observedRtp = totalWin / totalBet;

    expect(observedRtp).toBeCloseTo(0.95, 2);
  });
});

describe(getRtpTolerance.name, () => {
  it("uses a three-sigma tolerance with a one-percent floor", () => {
    expect(getRtpTolerance(10_000)).toBeGreaterThan(0.09);
    expect(getRtpTolerance(10_000)).toBeLessThan(0.1);
    expect(getRtpTolerance(1_000_000)).toBe(0.01);
  });

  it("requires a positive number of rounds", () => {
    expect(() => getRtpTolerance(0)).toThrow(
      "Rounds must be a positive integer",
    );
  });
});
