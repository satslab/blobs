// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import { assert, describe, it } from "@effect/vitest";
import {
  EnvironmentId,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
} from "@satslab/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as WebPush from "./WebPush.ts";

const THREAD_ID = ThreadId.make("push-thread");
const PROJECT_ID = ProjectId.make("push-project");
const NOW = "2026-09-04T12:00:00.000Z";

function shell(overrides: Partial<OrchestrationV2ThreadShell> = {}): OrchestrationV2ThreadShell {
  return {
    id: THREAD_ID,
    projectId: PROJECT_ID,
    title: "Fix the login bug",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: THREAD_ID, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    activeRunId: null,
    latestVisibleMessage: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    lastVisitedAt: null,
    deletedAt: null,
    branch: null,
    linkedPullRequest: null,
    status: "running",
    activityRunStatus: null,
    pendingRuntimeRequest: null,
    pendingBackgroundTasks: [],
    latestRunId: null,
    latestRunRequestedAt: null,
    latestRunStartedAt: null,
    latestRunCompletedAt: null,
    latestUserMessageAt: null,
    createdAt: DateTime.makeUnsafe(NOW),
    updatedAt: DateTime.makeUnsafe(NOW),
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

const needsInput = shell({
  status: "waiting",
  pendingRuntimeRequest: {
    id: RuntimeRequestId.make("request-1"),
    kind: "user_input",
    createdAt: DateTime.makeUnsafe(NOW),
  },
});
// Finished after the test server started, which is at the epoch on the test clock.
const completed = shell({ status: "completed", latestRunCompletedAt: DateTime.makeUnsafe(NOW) });

/** A browser subscription with real keys, so payloads encrypt and requests sign. */
function browserRegistration(deviceId: string) {
  const browser = NodeCrypto.createECDH("prime256v1");
  browser.generateKeys();
  const { privateKey } = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  return {
    deviceId,
    label: "Test browser",
    subscription: {
      endpoint: `https://push.example.test/${deviceId}`,
      p256dh: browser.getPublicKey().toString("base64url"),
      auth: NodeCrypto.randomBytes(16).toString("base64url"),
    },
    vapid: {
      publicKey: Buffer.concat([
        Buffer.from([4]),
        Buffer.from(jwk.x!, "base64url"),
        Buffer.from(jwk.y!, "base64url"),
      ]).toString("base64url"),
      privateKey: jwk.d!,
    },
  };
}

const makeTestWebPush = Effect.fnUntraced(function* (options: { readonly status?: number } = {}) {
  const secrets = new Map<string, Uint8Array>();
  const currentShell = yield* Ref.make(shell());
  const deliveries: Array<{ readonly url: string; readonly encoding: string | null }> = [];
  const fetch: typeof globalThis.fetch = Object.assign(
    (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1],
    ) => {
      deliveries.push({
        url: String(input),
        encoding: new Headers(init?.headers).get("content-encoding"),
      });
      return Promise.resolve(new Response(null, { status: options.status ?? 201 }));
    },
    { preconnect: () => {} },
  );
  const project = {
    id: PROJECT_ID,
    title: "Project",
    workspaceRoot: "/workspace",
    defaultModelSelection: null,
    scripts: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
  const webPush = yield* WebPush.make.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(ServerSecretStore.ServerSecretStore)({
          get: (name) => Effect.succeed(Option.fromUndefinedOr(secrets.get(name))),
          set: (name, value) => Effect.sync(() => void secrets.set(name, value)),
        }),
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getAgentAwarenessSnapshot: () =>
            Ref.get(currentShell).pipe(
              Effect.map((thread) => ({ snapshotSequence: 1, threads: [thread] })),
            ),
        }),
        Layer.mock(ProjectService.ProjectService)({
          getById: () => Effect.succeedSome(project),
        }),
        Layer.mock(ServerEnvironment.ServerEnvironment)({
          getEnvironmentId: Effect.succeed(EnvironmentId.make("push-environment")),
        }),
      ),
    ),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
  );
  const show = (thread: OrchestrationV2ThreadShell) =>
    Ref.set(currentShell, thread).pipe(
      Effect.andThen(webPush.notifyThread(THREAD_ID)),
      Effect.andThen(webPush.drain),
    );
  return { webPush, show, deliveries };
});

describe("WebPush", () => {
  it.effect("alerts each time a thread comes to need input, once, while the device is on", () =>
    Effect.gen(function* () {
      const { webPush, show, deliveries } = yield* makeTestWebPush();
      yield* webPush.register(browserRegistration("phone"));

      yield* show(needsInput);
      yield* show(needsInput);
      assert.deepEqual(deliveries, [
        { url: "https://push.example.test/phone", encoding: "aes128gcm" },
      ]);

      yield* show(shell());
      yield* show(needsInput);
      assert.equal(deliveries.length, 2);

      yield* webPush.setEnabled("phone", false);
      yield* show(shell());
      yield* show(needsInput);
      assert.equal(deliveries.length, 2);
      assert.deepEqual(yield* webPush.devices, {
        devices: [{ deviceId: "phone", label: "Test browser", enabled: false }],
      });
    }),
  );

  it.effect("holds a completion until it stays finished, and drops one that continues", () =>
    Effect.gen(function* () {
      const { webPush, show, deliveries } = yield* makeTestWebPush();
      yield* webPush.register(browserRegistration("phone"));

      yield* show(completed);
      yield* show(shell());
      yield* TestClock.adjust("5 seconds");
      yield* webPush.drain;
      assert.equal(deliveries.length, 0);

      yield* show(completed);
      assert.equal(deliveries.length, 0);
      yield* TestClock.adjust("5 seconds");
      yield* webPush.drain;
      assert.equal(deliveries.length, 1);
    }),
  );

  it.effect("forgets a subscription the push service says is gone", () =>
    Effect.gen(function* () {
      const { webPush, show } = yield* makeTestWebPush({ status: 410 });
      yield* webPush.register(browserRegistration("phone"));
      assert.equal((yield* webPush.devices).devices.length, 1);

      yield* show(needsInput);
      assert.deepEqual(yield* webPush.devices, { devices: [] });
    }),
  );
});
