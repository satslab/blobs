import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { EnvironmentId, BotId, RunId, ThreadId } from "@satslab/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeSqliteClient from "@satslab/shared/nodeSqliteClient";
import * as ServerConfig from "../config.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import migration from "../persistence/BlobsMigrations/001_BotChat.ts";
import * as BotStorage from "./BotStorage.ts";
import * as MemoryAccess from "./MemoryAccess.ts";

const database = Layer.effectDiscard(migration).pipe(
  Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
);
const layer = MemoryAccess.layer.pipe(
  Layer.provideMerge(BotStorage.layer),
  Layer.provide(database),
  Layer.provide(Layer.mock(ProjectionStore.ProjectionStoreV2)({})),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-memory-access-" })),
  Layer.provide(NodeServices.layer),
);

it.effect("uses the credential's frozen turn even after later messages and snapshots arrive", () =>
  Effect.gen(function* () {
    const storage = yield* BotStorage.BotStorage;
    const access = yield* MemoryAccess.MemoryAccess;
    const id = BotId.make("personal");
    const threadId = ThreadId.make("memory-thread");
    const firstRun = RunId.make("first");
    const secondRun = RunId.make("second");
    yield* storage.create({
      id,
      threadId,
      name: "Personal",
      ownerEnvironmentId: EnvironmentId.make("owner"),
      status: "active",
      generation: 0,
      destinationEnvironmentId: null,
    });
    yield* storage.append(id, [
      { key: "first", text: "first original", kind: "user", date: "2026-10-19T00:00:00.000Z" },
    ]);
    yield* storage.freeze({ botId: id, runId: firstRun, total: 1, view: "first view" });
    yield* storage.append(id, [
      { key: "second", text: "future original", kind: "talk", date: "2026-10-19T01:00:00.000Z" },
    ]);
    yield* storage.freeze({ botId: id, runId: secondRun, total: 2, view: "second view" });
    const first = { threadId, providerSessionId: "session-one", botRunId: firstRun };
    const second = { threadId, providerSessionId: "session-two", botRunId: secondRun };
    assert.equal(yield* access.zoom(first, 0, 1), "first original");
    const child = {
      ...first,
      threadId: ThreadId.make("delegated-child"),
      botThreadId: threadId,
    };
    assert.equal(yield* access.zoom(child, 0, 1), "first original");
    assert.equal(yield* access.date(child, 0), "2026-10-19T00:00:00.000Z");
    assert.equal((yield* Effect.result(access.zoom(child, 1, 1)))._tag, "Failure");
    assert.equal((yield* Effect.result(access.date(child, 1)))._tag, "Failure");
    assert.equal(
      (yield* Effect.result(access.zoom({ ...first, threadId: child.threadId }, 0, 1)))._tag,
      "Failure",
    );
    assert.equal((yield* Effect.result(access.zoom(first, 1, 1)))._tag, "Failure");
    assert.equal((yield* Effect.result(access.date(first, 1)))._tag, "Failure");
    assert.equal(yield* access.zoom(second, 1, 1), "future original");
    assert.equal(
      (yield* Effect.result(access.zoom({ threadId, providerSessionId: "unscoped" }, 0, 1)))._tag,
      "Failure",
    );
    assert.equal(
      (yield* Effect.result(access.zoom({ ...first, botRunId: RunId.make("unknown") }, 0, 1)))._tag,
      "Failure",
    );
  }).pipe(Effect.provide(layer)),
);
