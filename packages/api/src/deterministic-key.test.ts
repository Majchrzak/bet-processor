import { describe, expect, it } from "vitest";

import { createDeterministicKey } from "./deterministic-key";

describe(createDeterministicKey.name, () => {
  it("creates stable, framed UUIDv8 keys", () => {
    const key = createDeterministicKey(["wallet", "player-1", "USD"]);

    expect(key).toBe("b581e8ea-467f-8c3f-a723-ef0a3c3a9493");
    expect(createDeterministicKey(["wallet", "player-1", "USD"])).toBe(key);
    expect(createDeterministicKey(["ab", "c"])).not.toBe(
      createDeterministicKey(["a", "bc"]),
    );
  });
});
