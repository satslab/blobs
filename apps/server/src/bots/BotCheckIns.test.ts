import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import {
  BotId,
  ThreadId,
  ProjectId,
  EnvironmentId,
  ProviderInstanceId,
  EventId,
  MessageId,
  RunId,
  type OrchestrationV2AppThread,
  type OrchestrationV2Run,
  type OrchestrationV2ConversationMessage,
} from "@satslab/contracts";
import * as NodeSqliteClient from "@satslab/shared/nodeSqliteClient";
import * as BotCheckIns from "./BotCheckIns.ts";
import * as BotChat from "./BotChat.ts";
import * as BotStorage from "./BotStorage.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import { emptyProjection } from "../orchestration-v2/ProjectionStore.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import botMigration from "../persistence/BlobsMigrations/001_BotChat.ts";
import resourceMigration from "../persistence/BlobsMigrations/006_BotResources.ts";
import * as DateTime from "effect/DateTime";
import { assert, it } from "@effect/vitest";
import { DEFAULT_BOT_CHECK_IN, type BotResources } from "@satslab/contracts";
import { checkInDue } from "./BotCheckIns.ts";

it("respects disabled check-ins, overnight quiet hours, timezone and frequency", () => {
  const state: BotResources = {
    followUps: [],
    skills: [],
    secrets: [],
    lastCheckIn: null,
    checkIn: { ...DEFAULT_BOT_CHECK_IN, enabled: true, timezone: "Asia/Tokyo" },
  };
  const noon = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-29T03:00:00Z"));

  assert.equal(checkInDue(state, noon), true);
  assert.equal(
    checkInDue({ ...state, checkIn: { ...state.checkIn, enabled: false } }, noon),
    false,
  );
  assert.equal(checkInDue(state, noon + 12 * 3_600_000), false);
  assert.equal(checkInDue({ ...state, lastCheckIn: noon - 3_600_000 }, noon), false);
  assert.equal(checkInDue({ ...state, lastCheckIn: noon - 4 * 3_600_000 }, noon), true);
  assert.equal(
    checkInDue(
      { ...state, checkIn: { ...state.checkIn, quietStart: "12:00", quietEnd: "13:00" } },
      noon,
    ),
    false,
  );
  assert.equal(
    checkInDue(
      { ...state, checkIn: { ...state.checkIn, quietStart: "12:00", quietEnd: "12:00" } },
      noon,
    ),
    true,
  );
});

it.effect("skips busy bots and caps automatic messages while allowing manual checks", () =>
  Effect.gen(function* () {
    const provider = ProviderInstanceId.make("codex");
    const timestamp = DateTime.makeUnsafe("2026-10-29T03:00:00Z");
    const noon = DateTime.toEpochMillis(timestamp);
    const identity = {
      id: BotId.make("bot"),
      name: "Bot",
      ownerEnvironmentId: EnvironmentId.make("owner"),
      threadId: ThreadId.make("bot-thread"),
      generation: 0,
      status: "active" as const,
      destinationEnvironmentId: null,
    };
    const thread: OrchestrationV2AppThread = {
      id: identity.threadId,
      projectId: ProjectId.make("bot-project"),
      title: "Bot",
      providerInstanceId: provider,
      modelSelection: { instanceId: provider, model: "chat-model" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: {
        parentThreadId: null,
        rootThreadId: identity.threadId,
        relationshipToParent: null,
      },
      forkedFrom: null,
      createdBy: "user",
      creationSource: "web",
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    };
    let projection = emptyProjection({
      id: EventId.make("created"),
      type: "thread.created",
      threadId: thread.id,
      occurredAt: timestamp,
      payload: thread,
    });
    const run: OrchestrationV2Run = {
      id: RunId.make("check"),
      threadId: thread.id,
      ordinal: 1,
      providerInstanceId: provider,
      modelSelection: thread.modelSelection,
      providerThreadId: null,
      userMessageId: MessageId.make("bot-check-in:fixture"),
      rootNodeId: null,
      activeAttemptId: null,
      status: "completed",
      requestedAt: timestamp,
      startedAt: null,
      completedAt: timestamp,
      checkpointId: null,
      contextHandoffId: null,
    };
    const reply: OrchestrationV2ConversationMessage = {
      id: MessageId.make("reply"),
      threadId: thread.id,
      runId: run.id,
      nodeId: null,
      role: "assistant",
      text: "CI failed",
      attachments: [],
      streaming: false,
      createdBy: "agent",
      creationSource: "server",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const sent: Threads.ThreadManagementSendInput[] = [];
    const database = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* botMigration;
        yield* resourceMigration;
      }),
    ).pipe(Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })));
    const layer = BotCheckIns.layer.pipe(
      Layer.provideMerge(BotStorage.layer),
      Layer.provide(database),
      Layer.provide(Layer.mock(BotChat.BotChat)({ assertOwner: () => Effect.succeed(identity) })),
      Layer.provide(Layer.mock(Scheduler.Scheduler)({ register: () => Effect.void })),
      Layer.provide(
        Layer.mock(Threads.ThreadManagementService)({
          getThreadRecords: () => Effect.sync(() => projection),
          sendToThread: (input) =>
            Effect.sync(() => {
              sent.push(input);
              return {
                dispatch: { sequence: 1, storedEvents: [] },
                projection,
                run,
                message: reply,
                turnItem: null,
                delivery: "started" as const,
              };
            }),
        }),
      ),
    );
    yield* Effect.gen(function* () {
      const storage = yield* BotStorage.BotStorage;
      const checks = yield* BotCheckIns.BotCheckIns;
      yield* storage.create(identity);
      yield* TestClock.setTime(noon);
      yield* storage.saveResources(identity.id, {
        followUps: [],
        skills: [],
        secrets: [],
        lastCheckIn: null,
        checkIn: {
          ...DEFAULT_BOT_CHECK_IN,
          enabled: true,
          quietStart: "00:00",
          quietEnd: "00:00",
          maxPerDay: 1,
        },
      });
      yield* checks.check(identity.id);
      assert.equal(sent.length, 1);
      yield* checks.check(identity.id);
      assert.equal(sent.length, 1);
      projection = { ...projection, runs: [run], messages: [reply] };
      yield* storage.saveResources(identity.id, {
        ...(yield* storage.resources(identity.id)),
        lastCheckIn: null,
      });
      yield* checks.check(identity.id);
      assert.equal(sent.length, 1);
      yield* checks.check(identity.id, true);
      assert.equal(sent.length, 2);
      projection = { ...projection, runs: [{ ...run, status: "running" }] };
      assert.equal((yield* checks.check(identity.id, true).pipe(Effect.result))._tag, "Failure");
      assert.equal(sent.length, 2);
    }).pipe(Effect.provide(layer));
  }),
);
