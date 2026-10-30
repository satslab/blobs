import {
  BotChatError,
  CommandId,
  MessageId,
  type BotId,
  type BotResources as Resources,
} from "@satslab/contracts";
import * as DateTime from "effect/DateTime";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PartitionedSemaphore from "effect/PartitionedSemaphore";
import * as Schema from "effect/Schema";
import * as BotChat from "./BotChat.ts";
import * as BotStorage from "./BotStorage.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";

/** Sunday-first weekday (0–6) of `now` on the bot's own calendar. */
const localWeekday = (timeZone: string, now: number) =>
  DateTime.getPart(DateTime.makeZonedUnsafe(now, { timeZone }), "weekDay");

export function checkInDue(state: Resources, now: number) {
  const settings = state.checkIn;
  if (
    !settings.enabled ||
    !settings.activeDays.includes(localWeekday(settings.timezone, now)) ||
    (state.lastCheckIn !== null && now - state.lastCheckIn < settings.everyHours * 3_600_000)
  )
    return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(DateTime.toDateUtc(DateTime.makeUnsafe(now)));
  // Stored quiet boundaries hold the active complement, so a time is active outside them.
  const { quietStart, quietEnd } = settings;
  const quiet =
    quietStart < quietEnd
      ? parts >= quietStart && parts < quietEnd
      : parts >= quietStart || parts < quietEnd;
  return quietStart === quietEnd || !quiet;
}

const isBotChatError = Schema.is(BotChatError);
const make = Effect.gen(function* () {
  const bots = yield* BotChat.BotChat;
  const storage = yield* BotStorage.BotStorage;
  const threads = yield* Threads.ThreadManagementService;
  const checks = yield* PartitionedSemaphore.make<BotId>({ permits: 1 });
  const check = Effect.fn("BotCheckIns.check")(
    function* (id: BotId, manual = false) {
      yield* checks.withPermit(id)(
        Effect.gen(function* () {
          const bot = yield* bots.assertOwner(id);
          const state = yield* storage.resources(id);
          const now = yield* Clock.currentTimeMillis;
          if (!manual && !checkInDue(state, now)) return;
          const projection = yield* threads.getThreadRecords(bot.threadId, ["runs"]);
          if (
            projection.runs.some((run) =>
              ["queued", "preparing", "starting", "running", "waiting"].includes(run.status),
            )
          ) {
            if (manual) return yield* new BotChatError({ operation: "check-in", reason: "busy" });
            return;
          }
          if (!manual) {
            const today = new Intl.DateTimeFormat("en-CA", { timeZone: state.checkIn.timezone });
            const day = today.format(DateTime.toDateUtc(DateTime.makeUnsafe(now)));
            const checkInRuns = projection.runs
              .filter(
                (run) =>
                  run.userMessageId.startsWith("bot-check-in:") &&
                  [run.requestedAt, run.completedAt].some(
                    (date) => date !== null && today.format(DateTime.toDateUtc(date)) === day,
                  ),
              )
              .map((run) => run.id);
            if (checkInRuns.length > 0) {
              const history = yield* threads.getThreadRecords(bot.threadId, ["messages"], {
                runIds: checkInRuns,
                messageRoles: ["assistant"],
              });
              const count = history.messages.filter(
                (message) =>
                  message.text.trim() !== "NO_UPDATES" &&
                  message.text.trim() !== "" &&
                  today.format(DateTime.toDateUtc(message.createdAt)) === day,
              ).length;
              if (count >= state.checkIn.maxPerDay) return;
            }
          }
          const key = `bot-check-in:${id}:${now}`;
          const claimed = yield* storage.withBot(
            id,
            Effect.gen(function* () {
              const latest = yield* storage.resources(id);
              if (!manual && !checkInDue(latest, now)) return false;
              yield* storage.saveResources(id, { ...latest, lastCheckIn: now });
              return true;
            }),
          );
          if (!claimed) return;
          yield* threads
            .sendToThread({
              projectId: projection.thread.projectId,
              threadId: bot.threadId,
              commandId: CommandId.make(key),
              messageId: MessageId.make(key),
              mode: "queue",
              attachments: [],
              createdBy: "user",
              creationSource: "server",
              text: `Automatic check-in. Review your open follow-ups and check only what is due. Use read-only actions; do not make changes or send external messages. Update follow-up status when supported by evidence. Tell the user only about a new development needing attention. If there is nothing to report, reply exactly NO_UPDATES.\n${state.followUps
                .filter((item) => item.status === "open")
                .map((item) => `${item.key}: ${item.title} ${item.note} ${item.sourceUrl}`)
                .join("\n")}`,
            })
            .pipe(
              Effect.tapError(() =>
                storage.withBot(
                  id,
                  Effect.gen(function* () {
                    const latest = yield* storage.resources(id);
                    if (latest.lastCheckIn === now)
                      yield* storage.saveResources(id, {
                        ...latest,
                        lastCheckIn: state.lastCheckIn,
                      });
                  }),
                ),
              ),
            );
        }),
      );
    },
    (effect) =>
      effect.pipe(
        Effect.mapError((cause) =>
          isBotChatError(cause)
            ? cause
            : new BotChatError({ operation: "check-in", reason: "storage", cause }),
        ),
      ),
  );
  const scheduler = yield* Scheduler.Scheduler;
  yield* scheduler.register(
    "bot-check-ins",
    Effect.gen(function* () {
      for (const bot of yield* storage.list()) {
        if (bot.status !== "active") continue;
        yield* check(bot.id).pipe(
          Effect.catch(() => Effect.logWarning("Bot check-in failed", { botId: bot.id })),
        );
      }
    }),
  );
  return { check };
});
export class BotCheckIns extends Context.Service<BotCheckIns, Effect.Success<typeof make>>()(
  "@satslab/blobs/bots/BotCheckIns",
) {}
export const layer = Layer.effect(BotCheckIns, make);
