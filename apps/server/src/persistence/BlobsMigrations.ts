import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";
import BotChat from "./BlobsMigrations/001_BotChat.ts";
import BotProjects from "./BlobsMigrations/002_BotProjects.ts";
import OutgoingWebhooks from "./BlobsMigrations/003_OutgoingWebhooks.ts";
import OutgoingWebhookEndpointUrl from "./BlobsMigrations/004_OutgoingWebhookEndpointUrl.ts";
import BotIntegrations from "./BlobsMigrations/005_BotIntegrations.ts";
import BotResources from "./BlobsMigrations/006_BotResources.ts";
import BotSystemTimezone from "./BlobsMigrations/007_BotSystemTimezone.ts";
import NamespaceTables from "./BlobsMigrations/008_NamespaceTables.ts";

const entries = [
  [1, "BotChat", BotChat],
  [2, "BotProjects", BotProjects],
  [3, "OutgoingWebhooks", OutgoingWebhooks],
  [4, "OutgoingWebhookEndpointUrl", OutgoingWebhookEndpointUrl],
  [5, "BotIntegrations", BotIntegrations],
  [6, "BotResources", BotResources],
  [7, "BotSystemTimezone", BotSystemTimezone],
  [8, "NamespaceTables", NamespaceTables],
] as const;
export const blobsMigrationManifest = entries.map(([id, name]) => [id, name] as const);

export const ensureBlobsMigrationTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS sora_sql_migrations (
    migration_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
});

const run = Migrator.make({});
export const runBlobsMigrations = Effect.fn("runBlobsMigrations")(function* (throughId?: number) {
  const sql = yield* SqlClient.SqlClient;
  yield* ensureBlobsMigrationTable;
  const rows = yield* sql<{ migration_id: number; name: string }>`
    SELECT migration_id, name FROM sora_sql_migrations ORDER BY migration_id`;
  const highest = rows.at(-1)?.migration_id ?? 0;
  const names = new Map(rows.map((row) => [row.migration_id, row.name]));
  if (
    rows.some(
      (row) =>
        !blobsMigrationManifest.some(([id, name]) => id === row.migration_id && name === row.name),
    ) ||
    blobsMigrationManifest.some(([id, name]) => id <= highest && names.get(id) !== name)
  ) {
    return yield* new Migrator.MigrationError({
      kind: "BadState",
      message: "Unexpected Blobs migration history.",
    });
  }
  return yield* run({
    table: "sora_sql_migrations",
    loader: Migrator.fromRecord(
      Object.fromEntries(
        entries
          .filter(([id]) => throughId === undefined || id <= throughId)
          .map(([id, name, migration]) => [`${id}_${name}`, migration]),
      ),
    ),
  });
});
