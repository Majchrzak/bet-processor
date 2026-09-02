import { DataSource } from "typeorm";

import { config } from "./config";
import { AddGameTables1788217200000 } from "./migrations/1788217200000-add-game-tables";
import { ProcessGameActions1788303600000 } from "./migrations/1788303600000-process-game-actions";

export function createDataSource(): DataSource {
  const {
    BET_PROCESSOR_DATABASE_URL,
    BET_PROCESSOR_DB_POOL_SIZE,
    BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS,
  } = config();

  return new DataSource({
    type: "postgres",
    url: BET_PROCESSOR_DATABASE_URL,
    migrations: [
      AddGameTables1788217200000,
      ProcessGameActions1788303600000,
    ],
    migrationsTableName: "typeorm_migrations",
    poolSize: BET_PROCESSOR_DB_POOL_SIZE,
    extra: {
      statement_timeout: BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS,
    },
    synchronize: false,
  });
}
