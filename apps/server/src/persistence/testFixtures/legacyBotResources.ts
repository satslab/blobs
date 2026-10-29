import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE sats_bot_resources (
    bot_id TEXT PRIMARY KEY REFERENCES sats_bots(id), state_json TEXT NOT NULL
  )`;
  yield* sql`CREATE TABLE sats_bot_secrets (
    bot_id TEXT NOT NULL REFERENCES sats_bots(id), key TEXT NOT NULL, secret_ref TEXT NOT NULL,
    PRIMARY KEY(bot_id,key)
  ) WITHOUT ROWID`;
});
