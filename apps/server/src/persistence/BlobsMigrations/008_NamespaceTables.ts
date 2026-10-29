import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DROP INDEX IF EXISTS sats_bot_memory_jobs_ready`;
  yield* sql`DROP INDEX IF EXISTS idx_outgoing_webhook_jobs_due`;
  yield* sql`DROP INDEX IF EXISTS idx_outgoing_webhook_jobs_history`;
  yield* sql`DROP INDEX IF EXISTS bot_discord_routes_bot`;
  yield* sql`CREATE INDEX IF NOT EXISTS sora_bot_memory_jobs_ready ON sora_bot_memory_jobs(status,bot_id,count,id)`;
  const jobs =
    yield* sql`SELECT name FROM sqlite_master WHERE type='table' AND name='sora_outgoing_webhook_jobs'`;
  if (jobs.length > 0) {
    yield* sql`CREATE INDEX IF NOT EXISTS sora_outgoing_webhook_jobs_due ON sora_outgoing_webhook_jobs(next_attempt_at) WHERE status='queued'`;
    yield* sql`CREATE INDEX IF NOT EXISTS sora_outgoing_webhook_jobs_history ON sora_outgoing_webhook_jobs(webhook_id,created_at DESC)`;
  }
  yield* sql`CREATE INDEX IF NOT EXISTS sora_bot_discord_routes_bot ON sora_bot_discord_routes(bot_id)`;
});
