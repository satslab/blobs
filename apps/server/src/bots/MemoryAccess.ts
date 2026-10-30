import { BotChatError, type ThreadId, type RunId } from "@satslab/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as BotStorage from "./BotStorage.ts";
import { memoryTools } from "./MemoryTools.ts";

const isBotChatError = Schema.is(BotChatError);

const make = Effect.gen(function* () {
  const storage = yield* BotStorage.BotStorage;
  const resolve = Effect.fn("MemoryAccess.resolve")(function* (caller: {
    threadId: ThreadId;
    providerSessionId: string;
    botRunId?: RunId;
    botThreadId?: ThreadId;
  }) {
    const memory = yield* storage.forThread(caller.botThreadId ?? caller.threadId);
    if (!memory || memory.status !== "active")
      return yield* new BotChatError({ operation: "access", reason: "not-owner" });
    if (caller.botRunId === undefined)
      return yield* new BotChatError({ operation: "access", reason: "not-ready" });
    const snapshot = yield* storage.snapshot(memory.id, caller.botRunId);
    if (!snapshot) return yield* new BotChatError({ operation: "access", reason: "not-ready" });
    return { snapshot, tools: memoryTools(storage, memory.id) };
  });
  const zoom = Effect.fn("MemoryAccess.zoom")(function* (
    caller: {
      threadId: ThreadId;
      providerSessionId: string;
      botRunId?: RunId;
      botThreadId?: ThreadId;
    },
    id: number,
    count: number,
  ) {
    const { tools, snapshot } = yield* resolve(caller);
    return yield* tools.zoom(id, count, snapshot.total);
  });
  const date = Effect.fn("MemoryAccess.date")(function* (
    caller: {
      threadId: ThreadId;
      providerSessionId: string;
      botRunId?: RunId;
      botThreadId?: ThreadId;
    },
    id: number,
  ) {
    const { tools, snapshot } = yield* resolve(caller);
    return yield* tools.date(id, snapshot.total);
  });
  const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        isBotChatError(cause)
          ? cause
          : new BotChatError({ operation: "access", reason: "storage", cause }),
      ),
    );
  return {
    zoom: (...args: Parameters<typeof zoom>) => zoom(...args).pipe(wrap),
    date: (...args: Parameters<typeof date>) => date(...args).pipe(wrap),
  };
});
export class MemoryAccess extends Context.Service<MemoryAccess, Effect.Success<typeof make>>()(
  "@satslab/blobs/bots/MemoryAccess",
) {}
export const layer = Layer.effect(MemoryAccess, make);
