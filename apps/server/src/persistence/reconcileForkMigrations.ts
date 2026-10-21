import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import ShellStopRequestIndex from "./Migrations/068_ShellStopRequestIndex.ts";
import ThreadMessageSearch from "./Migrations/069_ThreadMessageSearch.ts";

const shippedForkMigrations = [
  "BotChat",
  "BotProjects",
  "OutgoingWebhooks",
  "OutgoingWebhookEndpointUrl",
  "BotIntegrations",
];

// Shipped fork schemas started at 68 or 69; move their history without replaying schema creation.
export const reconcileForkMigrations = Effect.fn("reconcileForkMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
      `;
      if (tables.length === 0) return;
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id >= 68
        ORDER BY migration_id DESC
      `;
      const firstBotMigration = history.find((row) => row.name === "BotChat");
      if (firstBotMigration === undefined || firstBotMigration.migration_id >= 70) return;
      const startId = firstBotMigration.migration_id;
      const forkHistory = history.filter((row) => row.migration_id >= startId);
      if (
        forkHistory.some((row) => shippedForkMigrations[row.migration_id - startId] !== row.name)
      ) {
        return yield* new Migrator.MigrationError({
          kind: "BadState",
          message: "Cannot upgrade Blobs with unexpected later migrations.",
        });
      }
      for (const row of forkHistory) {
        yield* sql`UPDATE effect_sql_migrations SET migration_id = ${row.migration_id + 70 - startId}
          WHERE migration_id = ${row.migration_id}`;
      }
      if (startId === 68) {
        yield* ShellStopRequestIndex;
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
          VALUES (68, 'ShellStopRequestIndex')`;
      }
      yield* ThreadMessageSearch;
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (69, 'ThreadMessageSearch')`;
    }),
  );
});
