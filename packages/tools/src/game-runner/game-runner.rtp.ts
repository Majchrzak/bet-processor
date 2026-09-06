import { getRtp, type UserRtpRow } from "../api";
import { userIdPrefix } from "../identifiers";
import type { RunConfig } from "./game-runner.config";
import { EXPECTED_RTP, getRtpTolerance } from "./game-runner.payout";

export async function verifyCasinoRtp(config: RunConfig, from: Date, to: Date) {
  const report = await getRtp(config, "casino", { from, to });
  const casino = report.data.find((row) => row.currency === config.currency);

  if (casino?.rtp == null) {
    throw new Error(`Casino RTP report has no ${config.currency} data`);
  }

  const tolerance = getRtpTolerance(config.rounds);
  if (Math.abs(casino.rtp - EXPECTED_RTP) > tolerance) {
    throw new Error(
      `Casino RTP ${(casino.rtp * 100).toFixed(2)}% is outside the allowed ±${(tolerance * 100).toFixed(2)}%`,
    );
  }

  return casino;
}

export async function verifyUserRtp(config: RunConfig, from: Date, to: Date) {
  const users = await fetchUserRtp(config, from, to);
  const expectedActiveUsers = Math.min(config.users, config.rounds);

  if (users.length !== expectedActiveUsers) {
    throw new Error(
      `Expected RTP for ${String(expectedActiveUsers)} active users, got ${String(users.length)}`,
    );
  }

  const rtps = users
    .map((row) => row.rtp)
    .filter((rtp): rtp is number => rtp !== null)
    .sort((left, right) => left - right);

  if (users.length >= 100 && rtps[0] === rtps.at(-1)) {
    throw new Error("Per-user RTP distribution has no variance");
  }

  return {
    active: users.length,
    max: percentile(rtps, 1),
    min: percentile(rtps, 0),
    p50: percentile(rtps, 0.5),
    p95: percentile(rtps, 0.95),
  };
}

async function fetchUserRtp(config: RunConfig, from: Date, to: Date) {
  const prefix = userIdPrefix(config.namespace);

  const rows: UserRtpRow[] = [];
  let cursor: string | undefined;

  do {
    const query = { cursor, from, limit: 1_000, to };
    const page = await getRtp(config, "user", query);

    rows.push(
      ...page.data.filter(
        (row) =>
          row.currency === config.currency && row.user_id.startsWith(prefix),
      ),
    );
    cursor = page.next_cursor ?? undefined;
  } while (cursor !== undefined);

  return rows;
}

function percentile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) {
    return null;
  }

  return values[Math.max(0, Math.ceil(values.length * ratio) - 1)] ?? null;
}
