import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS sora_bot_projects (
    project_id TEXT PRIMARY KEY, bot_id TEXT
  )`;
  yield* sql`INSERT OR IGNORE INTO sora_bot_projects (project_id, bot_id)
    SELECT threads.project_id, bots.id FROM sora_bots bots
    JOIN orchestration_v2_projection_threads threads ON threads.thread_id = bots.thread_id`;
});
