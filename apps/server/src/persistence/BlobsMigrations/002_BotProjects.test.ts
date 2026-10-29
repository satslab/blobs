import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@satslab/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import { runBlobsMigrations } from "../BlobsMigrations.ts";

it.effect("keeps bot project metadata outside upstream projections and source events", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 72 });
    yield* runBlobsMigrations(1);
    for (const id of ["memory", "ordinary"]) {
      yield* sql`INSERT INTO projection_projects (
        project_id, title, workspace_root, scripts_json, created_at, updated_at
      ) VALUES (${id}, ${id}, ${`/workspace/${id}`}, '[]', '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z')`;
      yield* sql`INSERT INTO orchestration_events (
        event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at,
        actor_kind, payload_json, metadata_json, application_event_version
      ) VALUES (${id}, 'project', ${id}, 1, 'project.created', '2026-10-20T00:00:00Z',
        'system', ${JSON.stringify({ projectId: id })}, '{}', 2)`;
    }
    yield* sql`INSERT INTO orchestration_v2_projection_threads (
      thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
      created_at, updated_at, payload_json
    ) VALUES ('memory-thread', 'memory', 'Memory', 'codex', 'full-access', 'default',
      '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z', '{}')`;
    yield* sql`INSERT INTO sora_bots (
      id, name, owner_environment_id, thread_id, state_json
    ) VALUES ('personal', 'Memory', 'local', 'memory-thread', '{}')`;
    yield* runBlobsMigrations(2);
    assert.deepEqual(yield* sql`SELECT project_id,bot_id FROM sora_bot_projects`, [
      { project_id: "memory", bot_id: "personal" },
    ]);
    assert.isFalse(
      (yield* sql<{ name: string }>`PRAGMA table_info(projection_projects)`).some(
        (column) => column.name === "is_bot",
      ),
    );
    assert.deepEqual(
      yield* sql`SELECT stream_id, json_extract(payload_json, '$.isBot') AS is_bot
        FROM orchestration_events WHERE event_type = 'project.created' ORDER BY stream_id`,
      [
        { stream_id: "memory", is_bot: null },
        { stream_id: "ordinary", is_bot: null },
      ],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
