import { createHash } from "node:crypto";

export function userIdPrefix(namespace: string | undefined) {
  if (namespace === undefined) {
    return "player-";
  }

  const namespaceHash = createHash("sha256")
    .update(namespace)
    .digest("hex")
    .slice(0, 12);

  return `player-${namespaceHash}-`;
}

export function createSeedUserId(
  playerNumber: number,
  namespace: string | undefined,
) {
  return `${userIdPrefix(namespace)}${playerNumber.toString()}`;
}

export function createWalletId(userId: string, currency: string) {
  const hash = createHash("sha256");

  for (const component of ["wallet", userId, currency]) {
    const value = Buffer.from(component, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(value.length);
    hash.update(length);
    hash.update(value);
  }

  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
