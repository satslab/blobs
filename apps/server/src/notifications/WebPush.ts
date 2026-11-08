import {
  isListedThreadLineage,
  type OrchestrationV2DomainEvent,
  type ThreadId,
  type WebPushDevices,
  WebPushError,
  type WebPushRegisterInput,
} from "@satslab/contracts";
import { type AgentAwarenessPhase, projectThreadAwarenessV2 } from "@satslab/shared/agentAwareness";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { makeAgentAwarenessPublishWorker } from "../relay/AgentAwarenessRelay.ts";
import { forkParked } from "../serverActivation.ts";
import { encryptWebPushPayload, vapidAuthorization } from "./webPushProtocol.ts";

/**
 * Browser push notifications sent by this server itself, with no relay: the same moments the
 * mobile app is alerted for (a thread needs input or approval, finished, or failed), to every
 * browser that registered a subscription here.
 */
export class WebPush extends Context.Service<
  WebPush,
  {
    readonly devices: Effect.Effect<WebPushDevices>;
    /** Registering a device again turns it back on. */
    readonly register: (input: WebPushRegisterInput) => Effect.Effect<void, WebPushError>;
    readonly setEnabled: (deviceId: string, enabled: boolean) => Effect.Effect<void, WebPushError>;
    readonly unregister: (deviceId: string) => Effect.Effect<void, WebPushError>;
    readonly test: (deviceId: string) => Effect.Effect<void, WebPushError>;
    /** Checks a thread for a moment worth alerting; `start` calls it for each thread event. */
    readonly notifyThread: (threadId: ThreadId) => Effect.Effect<void>;
    /** Waits until queued thread checks finish. */
    readonly drain: Effect.Effect<void>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("@satslab/blobs/notifications/WebPush") {}

const DEVICES_SECRET = "web-push-devices";
// Push services require a contact for the sender.
const VAPID_SUBJECT = "https://github.com/satslab/blobs";
// A run can end moments before its continuation starts, so a completion waits this long.
const COMPLETION_CONFIRM_MS = 5_000;
const ALERT_PHASES: ReadonlySet<AgentAwarenessPhase> = new Set([
  "waiting_for_input",
  "waiting_for_approval",
  "completed",
  "failed",
]);

const Device = Schema.Struct({
  deviceId: Schema.String,
  label: Schema.String,
  endpoint: Schema.String,
  p256dh: Schema.String,
  auth: Schema.String,
  vapidPublicKey: Schema.String,
  vapidPrivateKey: Schema.String,
  /** Absent means on. */
  disabled: Schema.optionalKey(Schema.Boolean),
});
type Device = typeof Device.Type;
const Devices = Schema.fromJsonString(Schema.Array(Device));
const decodeDevices = Schema.decodeUnknownEffect(Devices);
const encodeDevices = Schema.encodeEffect(Devices);

const Notification = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  /** In-app path the notification opens. */
  url: Schema.String,
  /** Replaces an earlier notification for the same thread. */
  tag: Schema.String,
});
type Notification = typeof Notification.Type;
const encodeNotification = Schema.encodeEffect(Schema.fromJsonString(Notification));

function shouldCheckThread(event: OrchestrationV2DomainEvent) {
  switch (event.type) {
    case "thread.created":
    case "thread.deleted":
    case "thread.archived":
    case "thread.settled":
    case "run.created":
    case "run.updated":
    case "runtime-request.updated":
      return true;
    default:
      return false;
  }
}

export const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;
  const scope = yield* Effect.scope;
  const startedAt = (yield* DateTime.now).epochMilliseconds;

  const storageError = (message: string) => () => new WebPushError({ reason: "storage", message });

  const readDevices = secrets.get(DEVICES_SECRET).pipe(
    Effect.flatMap((bytes) =>
      Option.isNone(bytes)
        ? Effect.succeed<ReadonlyArray<Device>>([])
        : decodeDevices(new TextDecoder().decode(bytes.value)),
    ),
    Effect.mapError(storageError("Could not read web push devices.")),
  );
  const devicesRef = yield* Ref.make<ReadonlyArray<Device>>(
    yield* readDevices.pipe(Effect.orElseSucceed(() => [])),
  );
  const writeDevices = (devices: ReadonlyArray<Device>) =>
    encodeDevices(devices).pipe(
      Effect.flatMap((json) => secrets.set(DEVICES_SECRET, new TextEncoder().encode(json))),
      Effect.andThen(Ref.set(devicesRef, devices)),
      Effect.mapError(storageError("Could not save web push devices.")),
    );
  const removeDevices = Effect.fn("WebPush.removeDevices")(function* (
    deviceIds: ReadonlySet<string>,
  ) {
    const devices = yield* Ref.get(devicesRef);
    yield* writeDevices(devices.filter((device) => !deviceIds.has(device.deviceId)));
  });

  const sendTo = Effect.fn("WebPush.sendTo")(function* (
    device: Device,
    notification: Notification,
  ) {
    const nowSeconds = Math.floor((yield* DateTime.now).epochMilliseconds / 1000);
    const body = encryptWebPushPayload({
      payload: new TextEncoder().encode(yield* encodeNotification(notification)),
      p256dh: device.p256dh,
      auth: device.auth,
    });
    const request = HttpClientRequest.post(device.endpoint).pipe(
      HttpClientRequest.setHeaders({
        authorization: vapidAuthorization({
          endpoint: device.endpoint,
          publicKey: device.vapidPublicKey,
          privateKey: device.vapidPrivateKey,
          subject: VAPID_SUBJECT,
          nowSeconds,
        }),
        "content-encoding": "aes128gcm",
        ttl: "86400",
        urgency: "high",
      }),
      HttpClientRequest.bodyUint8Array(body, "application/octet-stream"),
    );
    const response = yield* HttpClient.execute(request).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.timeout("10 seconds"),
    );
    return response.status;
  });

  /** Sends to each device; returns how many accepted it. Gone subscriptions are forgotten. */
  const sendToAll = Effect.fn("WebPush.sendToAll")(function* (
    devices: ReadonlyArray<Device>,
    notification: Notification,
  ) {
    const results = yield* Effect.forEach(
      devices,
      (device) =>
        sendTo(device, notification).pipe(
          Effect.map((status) => ({ device, status })),
          Effect.catchCause((cause) =>
            Effect.logWarning("web push delivery failed", {
              deviceLabel: device.label,
              cause,
            }).pipe(Effect.as({ device, status: 0 })),
          ),
        ),
      { concurrency: 4 },
    );
    const gone = new Set(
      results
        .filter((result) => result.status === 404 || result.status === 410)
        .map((result) => result.device.deviceId),
    );
    if (gone.size > 0) yield* removeDevices(gone).pipe(Effect.ignore);
    return results.filter((result) => result.status >= 200 && result.status < 300).length;
  });

  // The phase each thread last alerted for, so an unchanged phase alerts once.
  const alertedPhase = new Map<ThreadId, AgentAwarenessPhase>();
  // When each thread's completion may alert, after confirming it stayed completed.
  const completionDeadlines = new Map<ThreadId, number>();
  // Set once the worker exists; a completion re-queues its thread to confirm it.
  let enqueue: (threadId: ThreadId) => Effect.Effect<void> = () => Effect.void;

  const checkThread = Effect.fn("WebPush.checkThread")(function* (threadId: ThreadId) {
    const devices = (yield* Ref.get(devicesRef)).filter((device) => device.disabled !== true);
    if (devices.length === 0) return;
    const thread = (yield* threads.getAgentAwarenessSnapshot(threadId)).threads[0];
    if (!thread || thread.archivedAt !== null || !isListedThreadLineage(thread.lineage)) {
      alertedPhase.delete(threadId);
      completionDeadlines.delete(threadId);
      return;
    }
    const project = yield* projects.getById(thread.projectId);
    if (Option.isNone(project)) return;
    const environmentId = yield* serverEnvironment.getEnvironmentId;
    const state = projectThreadAwarenessV2({ environmentId, project: project.value, thread });
    const phase = state?.phase ?? null;
    if (state === null || phase === null || !ALERT_PHASES.has(phase)) {
      alertedPhase.delete(threadId);
      completionDeadlines.delete(threadId);
      return;
    }
    if (alertedPhase.get(threadId) === phase) return;
    // Results from before this server started were alerted, or not, by its previous run.
    if (
      (phase === "completed" || phase === "failed") &&
      (thread.latestRunCompletedAt == null ||
        DateTime.toEpochMillis(thread.latestRunCompletedAt) <= startedAt)
    )
      return;
    if (phase === "completed") {
      const now = (yield* DateTime.now).epochMilliseconds;
      const deadline = completionDeadlines.get(threadId);
      if (deadline === undefined) {
        completionDeadlines.set(threadId, now + COMPLETION_CONFIRM_MS);
        yield* Effect.forkIn(
          Effect.sleep(COMPLETION_CONFIRM_MS).pipe(Effect.andThen(enqueue(threadId))),
          scope,
        );
        return;
      }
      if (now < deadline) return;
    }
    completionDeadlines.delete(threadId);
    alertedPhase.set(threadId, phase);
    yield* sendToAll(devices, {
      title: state.threadTitle,
      body: state.detail ? `${state.headline} · ${state.detail}` : state.headline,
      url: state.deepLink,
      tag: `thread:${threadId}`,
    });
  });

  const worker = yield* makeAgentAwarenessPublishWorker((threadId: ThreadId) =>
    checkThread(threadId).pipe(
      Effect.catchCause((cause) => Effect.logWarning("web push check failed", { threadId, cause })),
    ),
  );
  enqueue = worker.enqueue;

  const findDevice = (deviceId: string) =>
    Ref.get(devicesRef).pipe(
      Effect.map((devices) => devices.find((device) => device.deviceId === deviceId)),
    );
  const notRegistered = () =>
    new WebPushError({
      reason: "not-registered",
      message: "This device is not registered for notifications here.",
    });

  return WebPush.of({
    devices: Ref.get(devicesRef).pipe(
      Effect.map((devices) => ({
        devices: devices.map((device) => ({
          deviceId: device.deviceId,
          label: device.label,
          enabled: device.disabled !== true,
        })),
      })),
    ),
    register: Effect.fn("WebPush.register")(function* (input) {
      const devices = yield* Ref.get(devicesRef);
      yield* writeDevices([
        ...devices.filter((device) => device.deviceId !== input.deviceId),
        {
          deviceId: input.deviceId,
          label: input.label,
          endpoint: input.subscription.endpoint,
          p256dh: input.subscription.p256dh,
          auth: input.subscription.auth,
          vapidPublicKey: input.vapid.publicKey,
          vapidPrivateKey: input.vapid.privateKey,
        },
      ]);
    }),
    setEnabled: Effect.fn("WebPush.setEnabled")(function* (deviceId, enabled) {
      const devices = yield* Ref.get(devicesRef);
      if (!devices.some((device) => device.deviceId === deviceId)) return yield* notRegistered();
      yield* writeDevices(
        devices.map((device) =>
          device.deviceId === deviceId ? { ...device, disabled: !enabled } : device,
        ),
      );
    }),
    unregister: Effect.fn("WebPush.unregister")(function* (deviceId) {
      yield* removeDevices(new Set([deviceId]));
    }),
    test: Effect.fn("WebPush.test")(function* (deviceId) {
      const device = yield* findDevice(deviceId);
      if (device === undefined) return yield* notRegistered();
      const environment = yield* serverEnvironment.getDescriptor;
      const delivered = yield* sendToAll([device], {
        title: environment.label,
        body: "Notifications are working.",
        url: "/",
        tag: "web-push-test",
      });
      if (delivered === 0)
        return yield* new WebPushError({
          reason: "delivery",
          message: "The push service did not accept the notification.",
        });
    }),
    notifyThread: worker.enqueue,
    drain: worker.drain,
    start: Effect.fn("WebPush.start")(function* () {
      yield* forkParked(
        Stream.runForEach(threads.streamDomainEvents, (event) =>
          shouldCheckThread(event) ? enqueue(event.threadId) : Effect.void,
        ),
      );
    }),
  });
});

export const layer = Layer.effect(WebPush, make);
