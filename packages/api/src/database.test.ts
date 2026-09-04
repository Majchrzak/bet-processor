import { describe, expect, it, vi } from "vitest";

import { createDataSource } from "./database";
import { AddGameTables1788217200000 } from "./migrations/1788217200000-add-game-tables";
import { ProcessGameActions1788303600000 } from "./migrations/1788303600000-process-game-actions";
import { AddRtpAggregatesAndRetention1788390000000 } from "./migrations/1788390000000-add-rtp-aggregates-and-retention";

describe(createDataSource.name, () => {
  it("registers the fresh financial migration and runtime pool settings", () => {
    vi.stubEnv("BET_PROCESSOR_HMAC_SECRET", "test-secret");
    vi.stubEnv(
      "BET_PROCESSOR_DATABASE_URL",
      "postgresql://postgres:postgres@localhost:5432/bet_processor",
    );
    vi.stubEnv("BET_PROCESSOR_DB_POOL_SIZE", "25");
    vi.stubEnv("BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS", "2500");

    const dataSource = createDataSource();
    vi.unstubAllEnvs();

    expect(dataSource.options).toMatchObject({
      migrations: [
        AddGameTables1788217200000,
        ProcessGameActions1788303600000,
        AddRtpAggregatesAndRetention1788390000000,
      ],
      migrationsTableName: "typeorm_migrations",
      poolSize: 25,
      extra: { statement_timeout: 2_500 },
      synchronize: false,
    });
  });
});
