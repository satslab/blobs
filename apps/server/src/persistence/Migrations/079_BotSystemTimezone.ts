import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  yield* sql`UPDATE sats_bot_resources
    SET state_json=json_set(state_json,'$.checkIn.timezone',${timezone})
    WHERE json_extract(state_json,'$.checkIn.timezone')='UTC'
      AND json_extract(state_json,'$.checkIn.enabled')=0
      AND json_extract(state_json,'$.lastCheckIn') IS NULL`;
});
