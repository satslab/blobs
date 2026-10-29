import { vi } from "vite-plus/test";
import systemTimezoneMigration from "../persistence/BlobsMigrations/007_BotSystemTimezone.ts";
import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { BotId, EnvironmentId, ProjectId, ThreadId } from "@satslab/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as NodeSqliteClient from "@satslab/shared/nodeSqliteClient";
import * as Config from "../config.ts";
import * as SecretStore from "../auth/ServerSecretStore.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import botMigration from "../persistence/BlobsMigrations/001_BotChat.ts";
import resourceMigration from "../persistence/BlobsMigrations/006_BotResources.ts";
import * as BotStorage from "./BotStorage.ts";
import * as BotResources from "./BotResources.ts";

const database = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* botMigration;
    yield* resourceMigration;
  }),
).pipe(Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })));
const layer = BotResources.layer.pipe(
  Layer.provideMerge(SecretStore.layer),
  Layer.provideMerge(BotStorage.layer),
  Layer.provideMerge(database),
  Layer.provideMerge(
    Layer.mock(SecretRequests.SecretRequests)({ consume: () => Effect.succeed("fixture-token") }),
  ),
  Layer.provideMerge(Config.layerTest(process.cwd(), { prefix: "t3-bot-resources-" })),
  Layer.provideMerge(NodeServices.layer),
);
const source = BotId.make("source");
const destination = BotId.make("destination");
const project = ProjectId.make("project");

it.effect(
  "keeps secret values out of bot rows and transfers skills and encrypted credentials",
  () =>
    Effect.gen(function* () {
      const storage = yield* BotStorage.BotStorage;
      const resources = yield* BotResources.BotResources;
      const fs = yield* FileSystem.FileSystem;
      const sql = yield* SqlClient.SqlClient;
      for (const id of [source, destination])
        yield* storage.create({
          id,
          name: id,
          ownerEnvironmentId: EnvironmentId.make("owner"),
          threadId: ThreadId.make(id),
          generation: 0,
          status: "active",
          destinationEnvironmentId: null,
        });
      yield* resources.change(
        source,
        {
          type: "follow-up.save",
          item: {
            key: "release",
            title: "Release",
            note: "Waiting for CI",
            sourceUrl: "https://example.com/pr/1",
            status: "open",
          },
        },
        project,
      );
      yield* resources.change(
        source,
        {
          type: "skill.save",
          key: "review",
          description: "Review releases",
          content: "# Release review\nCheck CI.",
        },
        project,
      );
      yield* resources.change(
        source,
        { type: "secret.save", key: "api-token", secretRef: "secret-ref:fixture" },
        project,
      );
      const path = yield* resources.secretPath(source, "api-token");
      assert.equal(yield* fs.readFileString(path), "fixture-token");
      const rows = yield* sql<{
        secret_ref: string;
      }>`SELECT secret_ref FROM sora_bot_secrets WHERE bot_id=${source}`;
      assert.match(rows[0]?.secret_ref ?? "", /^bot-secret-/);
      assert.notInclude(rows[0]?.secret_ref ?? "", "fixture-token");
      assert.equal((yield* storage.resources(destination)).secrets.length, 0);
      const transfer = yield* resources.exportResources(source, "ownership-proof");
      assert.notInclude(transfer.encryptedSecrets, "fixture-token");
      assert.equal(
        (yield* resources.importResources(destination, transfer, "wrong-proof").pipe(Effect.result))
          ._tag,
        "Failure",
      );
      assert.equal((yield* storage.resources(destination)).skills.length, 0);
      yield* resources.change(
        destination,
        { type: "skill.save", key: "old-skill", description: "Old", content: "Old instructions" },
        project,
      );
      yield* resources.change(
        destination,
        { type: "secret.save", key: "old-token", secretRef: "secret-ref:old" },
        project,
      );
      const oldPath = yield* resources.secretPath(destination, "old-token");
      yield* resources.importResources(destination, transfer, "ownership-proof");
      assert.equal(yield* fs.exists(oldPath), false);
      assert.deepEqual(yield* storage.resources(destination), yield* storage.resources(source));
      const destinationPath = yield* resources.secretPath(destination, "api-token");
      assert.notEqual(destinationPath, path);
      assert.equal(yield* fs.readFileString(destinationPath), "fixture-token");
      const config = yield* Config.ServerConfig;
      const workspace = `${config.stateDir}/bots/bot-destination/workspace`;
      assert.equal(
        yield* fs.readFileString(`${workspace}/skills/review.md`),
        "# Release review\nCheck CI.",
      );
      yield* resources.change(destination, { type: "skill.delete", key: "review" }, project);
      assert.equal(yield* fs.exists(`${workspace}/skills/review.md`), false);
      yield* resources.change(destination, { type: "secret.delete", key: "api-token" }, project);
      assert.equal(yield* fs.exists(destinationPath), false);
      assert.equal(yield* fs.exists(path), true);
    }).pipe(Effect.provide(layer)),
);

it.effect(
  "detects the server timezone for new bots and unused defaults while preserving configured check-ins",
  () =>
    Effect.gen(function* () {
      using _timezone = vi
        .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
        .mockReturnValue({ ...Intl.DateTimeFormat().resolvedOptions(), timeZone: "Asia/Tokyo" });
      const storage = yield* BotStorage.BotStorage;
      for (const id of [source, destination])
        yield* storage.create({
          id,
          name: id,
          ownerEnvironmentId: EnvironmentId.make("owner"),
          threadId: ThreadId.make(id),
          generation: 0,
          status: "active",
          destinationEnvironmentId: null,
        });
      const initial = yield* storage.resources(source);
      assert.equal(initial.checkIn.timezone, "Asia/Tokyo");
      yield* storage.saveResources(source, {
        ...initial,
        checkIn: { ...initial.checkIn, timezone: "UTC" },
      });
      yield* storage.saveResources(destination, {
        ...initial,
        checkIn: { ...initial.checkIn, enabled: true, timezone: "UTC" },
      });
      yield* systemTimezoneMigration;
      assert.equal((yield* storage.resources(source)).checkIn.timezone, "Asia/Tokyo");
      assert.equal((yield* storage.resources(destination)).checkIn.timezone, "UTC");
    }).pipe(Effect.provide(layer)),
);
