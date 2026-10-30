import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@satslab/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationManifest, runMigrations } from "./Migrations.ts";
import BotChat from "./testFixtures/legacyBotChat.ts";
import BotProjects from "./testFixtures/legacyBotProjectsMigration.ts";
import OutgoingWebhooks from "./testFixtures/legacyOutgoingWebhooks.ts";
import OutgoingWebhookEndpointUrl from "./testFixtures/legacyOutgoingWebhookEndpointUrl.ts";
import BotIntegrations from "./testFixtures/legacyBotIntegrations.ts";
import BotResources from "./testFixtures/legacyBotResources.ts";
import BotSystemTimezone from "./testFixtures/legacyBotSystemTimezone.ts";
import { runBlobsMigrations, blobsMigrationManifest } from "./BlobsMigrations.ts";

it.effect("runs Blobs upgrades independently of a newer upstream migration id", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: migrationManifest.at(-1)?.[0] });
    yield* runBlobsMigrations(7);
    const nextMigrationId = Math.max(...migrationManifest.map(([id]) => id)) + 1;
    yield* Migrator.make({})({
      loader: Migrator.fromRecord({
        [`${nextMigrationId}_NextUpstream`]: sql`CREATE TABLE next_upstream(id TEXT PRIMARY KEY)`,
      }),
    });
    yield* sql`INSERT INTO next_upstream VALUES ('retained')`;
    yield* runMigrations();
    assert.deepEqual(yield* sql`SELECT * FROM next_upstream`, [{ id: "retained" }]);
    assert.deepEqual(
      yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id=${nextMigrationId}`,
      [{ name: "NextUpstream" }],
    );
    assert.deepEqual(yield* sql`SELECT name FROM sora_sql_migrations WHERE migration_id=8`, [
      { name: "NamespaceTables" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("moves legacy bot project flags out of projections and source events", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 72 });
    yield* Migrator.make({})({ loader: Migrator.fromRecord({ "73_BotChat": BotChat }) });
    for (const id of ["memory", "ordinary"]) {
      yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at)
        VALUES (${id},${id},${`/workspace/${id}`},'[]','2026-10-20T00:00:00Z','2026-10-20T00:00:00Z')`;
      yield* sql`INSERT INTO orchestration_events(event_id,aggregate_kind,stream_id,stream_version,event_type,
        occurred_at,actor_kind,payload_json,metadata_json,application_event_version)
        VALUES (${id},'project',${id},1,'project.created','2026-10-20T00:00:00Z','system',
          ${JSON.stringify({ projectId: id, title: id })},'{}',2)`;
    }
    yield* sql`INSERT INTO orchestration_v2_projection_threads(thread_id,project_id,title,default_provider,
      runtime_mode,interaction_mode,created_at,updated_at,payload_json)
      VALUES ('memory-thread','memory','Memory','codex','full-access','default',
        '2026-10-20T00:00:00Z','2026-10-20T00:00:00Z','{}')`;
    yield* sql`INSERT INTO sats_bots(id,name,owner_environment_id,thread_id,state_json)
      VALUES ('personal','Memory','local','memory-thread','{}')`;
    yield* Migrator.make({})({ loader: Migrator.fromRecord({ "74_BotProjects": BotProjects }) });
    yield* runMigrations();
    assert.deepEqual(yield* sql`SELECT * FROM sora_bot_projects`, [
      { project_id: "memory", bot_id: "personal" },
    ]);
    assert.isFalse(
      (yield* sql<{ name: string }>`PRAGMA table_info(projection_projects)`).some(
        (column) => column.name === "is_bot",
      ),
    );
    assert.deepEqual(yield* sql`SELECT payload_json FROM orchestration_events ORDER BY stream_id`, [
      { payload_json: JSON.stringify({ projectId: "memory", title: "memory" }) },
      { payload_json: JSON.stringify({ projectId: "ordinary", title: "ordinary" }) },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect.each(
  [68, 69, 70, 73].flatMap((startId) =>
    [68, 69, 70, 71, 72, 73, 74].map((lastId) => ({ startId, lastId })),
  ),
)(
  "upgrades shipped Blobs migrations starting at $startId through offset $lastId",
  ({ startId, lastId }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys=ON`;
      yield* runMigrations({ toMigrationInclusive: startId - 1 });
      yield* Migrator.make({})({
        loader: Migrator.fromRecord({
          [`${startId}_BotChat`]: BotChat,
          ...(lastId >= 69 ? { [`${startId + 1}_BotProjects`]: BotProjects } : {}),
          ...(lastId >= 70 ? { [`${startId + 2}_OutgoingWebhooks`]: OutgoingWebhooks } : {}),
          ...(lastId >= 71
            ? { [`${startId + 3}_OutgoingWebhookEndpointUrl`]: OutgoingWebhookEndpointUrl }
            : {}),
          ...(lastId >= 72 ? { [`${startId + 4}_BotIntegrations`]: BotIntegrations } : {}),
          ...(lastId >= 73 ? { [`${startId + 5}_BotResources`]: BotResources } : {}),
          ...(lastId >= 74 ? { [`${startId + 6}_BotSystemTimezone`]: BotSystemTimezone } : {}),
        }),
      });
      yield* sql`INSERT INTO sats_bots (id, name, owner_environment_id, thread_id, state_json)
      VALUES ('personal', 'Memory', 'local', 'memory-thread', '{}')`;
      yield* sql`INSERT INTO sats_bot_memory_messages (bot_id, id, event_key, kind, text, date)
      VALUES ('personal', 1, 'event', 'user', 'Remember this', '2026-10-24')`;
      yield* sql`UPDATE effect_sql_migrations SET created_at = '2026-10-20 00:00:00'
      WHERE migration_id >= 68`;
      const bots = yield* sql`SELECT * FROM sats_bots`;
      const memory = yield* sql`SELECT * FROM sats_bot_memory_messages`;
      if (lastId >= 70) {
        yield* sql`INSERT INTO outgoing_webhooks
        (id, name, enabled, events_json, template, preview_length, endpoint_origin, header_names_json, created_at, updated_at)
        VALUES ('existing', 'Existing', 1, '["completed"]', '{}', 500, 'https://hooks.example.test', '[]', '2026-10-20', '2026-10-20')`;
        yield* sql`INSERT INTO outgoing_webhook_jobs
        (id, webhook_id, dedupe_key, event_type, context_json, status, next_attempt_at, created_at, updated_at)
        VALUES ('job', 'existing', 'dedupe', 'completed', '{}', 'queued', 0, '2026-10-20', '2026-10-20')`;
      }
      if (lastId >= 71) {
        yield* sql`UPDATE outgoing_webhooks SET endpoint_url = 'https://hooks.example.test/path'`;
      }
      if (lastId >= 72) {
        yield* sql`INSERT INTO bot_discord_settings VALUES ('personal', '{"enabled":true}')`;
        yield* sql`INSERT INTO bot_discord_routes VALUES ('route', 'personal', '{}')`;
        yield* sql`INSERT INTO bot_discord_messages VALUES ('personal', 'message', 'route')`;
        yield* sql`INSERT INTO bot_discord_replies VALUES ('personal', 'reply', 'route', 'text', 'Saved reply', '["message"]')`;
      }
      if (lastId >= 73) {
        yield* sql`INSERT INTO sats_bot_resources VALUES ('personal','{"followUps":[],"skills":[],"checkIn":{"enabled":true,"timezone":"UTC"},"lastCheckIn":null}')`;
        yield* sql`INSERT INTO sats_bot_secrets VALUES ('personal','token','existing-secret-reference')`;
      }
      const jobs = lastId >= 70 ? yield* sql`SELECT * FROM outgoing_webhook_jobs` : [];
      const replies = lastId >= 72 ? yield* sql`SELECT * FROM bot_discord_replies` : [];
      yield* runMigrations();
      assert.deepStrictEqual(yield* runMigrations(), []);
      if (lastId >= 70) {
        assert.deepStrictEqual(yield* sql`SELECT * FROM sora_outgoing_webhook_jobs`, jobs);
        assert.deepStrictEqual(
          yield* sql`SELECT endpoint_origin, endpoint_url FROM sora_outgoing_webhooks`,
          [
            {
              endpoint_origin: "https://hooks.example.test",
              endpoint_url: lastId >= 71 ? "https://hooks.example.test/path" : null,
            },
          ],
        );
      }
      if (lastId >= 72) {
        assert.deepStrictEqual(yield* sql`SELECT * FROM sora_bot_discord_replies`, replies);
        assert.deepStrictEqual(yield* sql`SELECT * FROM sora_bot_discord_routes`, [
          { id: "route", bot_id: "personal", route_json: "{}" },
        ]);
        assert.deepStrictEqual(yield* sql`SELECT * FROM sora_bot_discord_settings`, [
          { bot_id: "personal", settings_json: '{"enabled":true}' },
        ]);
        assert.deepStrictEqual(yield* sql`SELECT * FROM sora_bot_discord_messages`, [
          { bot_id: "personal", message_id: "message", route_id: "route" },
        ]);
      }
      assert.deepStrictEqual(yield* sql`SELECT * FROM sora_bots`, bots);
      assert.deepStrictEqual(yield* sql`SELECT * FROM sora_bot_memory_messages`, memory);
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
      SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
    `;
      assert.deepStrictEqual(
        history.map((row) => [row.migration_id, row.name] as const),
        migrationManifest,
      );
      assert.deepStrictEqual(
        yield* sql`SELECT created_at FROM sora_sql_migrations WHERE migration_id = 1`,
        [{ created_at: "2026-10-20 00:00:00" }],
      );
      assert.deepStrictEqual(
        (yield* sql<{ migration_id: number; name: string }>`SELECT migration_id,name
          FROM sora_sql_migrations ORDER BY migration_id`).map(
          (row) => [row.migration_id, row.name] as const,
        ),
        blobsMigrationManifest,
      );
      if (lastId >= 73)
        assert.deepEqual(yield* sql`SELECT * FROM sora_bot_secrets`, [
          { bot_id: "personal", key: "token", secret_ref: "existing-secret-reference" },
        ]);
      assert.isFalse(
        (yield* sql<{ name: string }>`PRAGMA table_info(projection_projects)`).some(
          (column) => column.name === "is_bot",
        ),
      );
      assert.strictEqual(
        (yield* sql`SELECT name FROM sqlite_master WHERE type = 'index'
        AND name = 'orchestration_v2_projection_turn_items_stop_request_idx'`).length,
        1,
      );
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect.each(["history", "schema", "rename"] as const)(
  "rejects invalid legacy %s without changing data or history",
  (invalid) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 67 });
      yield* Migrator.make({})({ loader: Migrator.fromRecord({ "68_BotChat": BotChat }) });
      if (invalid === "history")
        yield* sql`INSERT INTO effect_sql_migrations (migration_id,name) VALUES (99,'Unknown')`;
      if (invalid === "schema") yield* sql`ALTER TABLE sats_bots DROP COLUMN transfer_json`;
      if (invalid === "rename") yield* sql`CREATE TABLE sora_bot_transfer_chunks(unrelated TEXT)`;
      const schema = yield* sql`SELECT name,sql FROM sqlite_master ORDER BY name`;

      const before = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
      const error = yield* runMigrations().pipe(Effect.flip);
      assert.isDefined(error);
      assert.deepEqual(yield* sql`SELECT name,sql FROM sqlite_master ORDER BY name`, schema);
      assert.deepStrictEqual(
        yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
        before,
      );
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
