import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Finish upgrades of preserved legacy tables without creating them on fresh installs.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables =
    yield* sql`SELECT name FROM sqlite_master WHERE type='table' AND name='sora_outgoing_webhooks'`;
  if (tables.length > 0)
    yield* sql`ALTER TABLE sora_outgoing_webhooks ADD COLUMN endpoint_url TEXT`;
});
