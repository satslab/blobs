import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";
import { ensureBlobsMigrationTable, blobsMigrationManifest } from "./BlobsMigrations.ts";
import { legacyBlobsTables } from "./blobsTables.ts";

const badState = (message: string) => new Migrator.MigrationError({ kind: "BadState", message });

// Adopt only recognized shipped schemas; never infer a completed migration from an occupied id.
export const reconcileForkMigrations = Effect.fn("reconcileForkMigrations")(function* (
  upstreamManifest: ReadonlyArray<readonly [number, string]>,
) {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type='table'`;
  if (!tables.some((table) => table.name === "effect_sql_migrations")) return;
  const history = yield* sql<{ migration_id: number; name: string; created_at: string }>`
    SELECT migration_id,name,created_at FROM effect_sql_migrations ORDER BY migration_id`;
  const first = history.find((row) => row.name === "BotChat");
  if (!first) return;
  if (first.migration_id < 68 || first.migration_id > 73)
    return yield* badState("Unrecognized Blobs migration sequence.");
  const legacy = history.filter((row) => row.migration_id >= first.migration_id);
  for (const row of legacy) {
    const expected = blobsMigrationManifest[row.migration_id - first.migration_id];
    if (!expected || expected[0] > 7 || expected[1] !== row.name)
      return yield* badState("Cannot upgrade Blobs with unexpected later migrations.");
  }
  if (legacy.some((row, index) => row.migration_id !== first.migration_id + index))
    return yield* badState("Incomplete Blobs migration history.");
  const upstreamNames = new Map(upstreamManifest);
  if (
    history.some(
      (row) =>
        row.migration_id < first.migration_id &&
        row.migration_id >= 55 &&
        upstreamNames.get(row.migration_id) !== row.name,
    )
  )
    return yield* badState("Unexpected upstream migration history before Blobs migrations.");
  const completed = legacy.length;
  for (const [version, name, , required] of legacyBlobsTables) {
    if (version > completed) continue;
    const columns = yield* sql<{ name: string }>`PRAGMA table_info(${sql(name)})`;
    const names = new Set(columns.map((column) => column.name));
    if (required.some((column) => !names.has(column)))
      return yield* badState(`Cannot adopt Blobs migration with incomplete table ${name}.`);
  }
  const projectColumns = yield* sql<{ name: string }>`PRAGMA table_info(projection_projects)`;
  if (completed >= 2 && !projectColumns.some((column) => column.name === "is_bot"))
    return yield* badState("Cannot adopt BotProjects without its legacy column.");
  if (completed >= 4) {
    const columns = yield* sql<{ name: string }>`PRAGMA table_info(outgoing_webhooks)`;
    if (!columns.some((column) => column.name === "endpoint_url"))
      return yield* badState(
        "Cannot adopt outgoing webhook endpoint migration without its column.",
      );
  }
  yield* ensureBlobsMigrationTable;
  const recorded = yield* sql`SELECT migration_id FROM sora_sql_migrations`;
  if (recorded.length > 0)
    return yield* badState("Both legacy and independent Blobs migration histories exist.");
  yield* sql`CREATE TABLE sora_bot_projects(project_id TEXT PRIMARY KEY, bot_id TEXT)`;
  yield* sql`INSERT OR IGNORE INTO sora_bot_projects(project_id,bot_id)
    SELECT threads.project_id,bots.id FROM sats_bots bots
    JOIN orchestration_v2_projection_threads threads ON threads.thread_id=bots.thread_id`;
  if (completed >= 2) {
    yield* sql`INSERT OR IGNORE INTO sora_bot_projects(project_id)
      SELECT project_id FROM projection_projects WHERE is_bot=1`;
    yield* sql`ALTER TABLE projection_projects DROP COLUMN is_bot`;
    yield* sql`UPDATE orchestration_events SET payload_json=json_remove(payload_json,'$.isBot')
      WHERE application_event_version=2 AND aggregate_kind='project'
      AND event_type IN ('project.created','project.meta-updated')
      AND json_type(payload_json,'$.isBot') IS NOT NULL`;
  }
  for (const row of legacy) {
    const id = row.migration_id - first.migration_id + 1;
    yield* sql`INSERT INTO sora_sql_migrations(migration_id,name,created_at)
      VALUES (${id},${row.name},${row.created_at})`;
    yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id=${row.migration_id} AND name=${row.name}`;
  }
  for (const [version, oldName, newName] of legacyBlobsTables) {
    if (version <= completed) yield* sql`ALTER TABLE ${sql(oldName)} RENAME TO ${sql(newName)}`;
  }
});
