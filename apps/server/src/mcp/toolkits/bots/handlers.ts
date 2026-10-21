import { OrchestratorMcpFailure } from "@satslab/contracts";
import * as Effect from "effect/Effect";
import * as MemoryAccess from "../../../bots/MemoryAccess.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as BotChat from "../../../bots/BotChat.ts";
import { BotDiscoveryToolkit, MemoryToolkit } from "./tools.ts";
const caller = Effect.gen(function* () {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  return (yield* McpInvocationContext.requireThreadScope(scope, "Memory navigation")).thread;
});
const failure = (error: { message: string }) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });
export const layer = McpToolAccess.toLayer(
  MemoryToolkit,
  Effect.gen(function* () {
    const access = yield* MemoryAccess.MemoryAccess;
    return {
      zoom: McpToolAccess.readsAsCaller((input) =>
        caller.pipe(
          Effect.flatMap((scope) => access.zoom(scope, input.id, input.n)),
          Effect.mapError(failure),
        ),
      ),
      date: McpToolAccess.readsAsCaller((input) =>
        caller.pipe(
          Effect.flatMap((scope) => access.date(scope, input.id)),
          Effect.mapError(failure),
        ),
      ),
      t3_attachment_read: McpToolAccess.readsAsCaller((input) =>
        caller.pipe(
          Effect.flatMap((scope) =>
            access.attachment(scope, {
              attachmentId: input.attachmentId,
              offset: input.offset ?? 0,
              length: input.length ?? 32768,
              encoding: input.encoding ?? "utf8",
            }),
          ),
          Effect.mapError(failure),
        ),
      ),
    };
  }),
);

const currentBot = Effect.gen(function* () {
  const scope = yield* caller;
  const bots = yield* BotChat.BotChat;
  const bot = yield* bots.forThread(scope.threadId).pipe(Effect.mapError(failure));
  if (!bot)
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: "This tool requires the bot's own conversation.",
    });
  yield* bots.assertOwner(bot.id).pipe(Effect.mapError(failure));
  return { bots, bot };
});
export const layerDiscovery = McpToolAccess.toLayer(BotDiscoveryToolkit, {
  t3_bot_browser_fill_secret: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireThreadMcpCapability("preview").pipe(
        Effect.mapError(failure),
      );
      const { bots, bot } = yield* currentBot;
      return yield* bots.fillBrowserSecret(bot.id, scope, input).pipe(Effect.mapError(failure));
    }),
  ),
  t3_bot_resources: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { bots, bot } = yield* currentBot;
      return yield* (
        input.action ? bots.changeResources(bot.id, input.action) : bots.readResources(bot.id)
      ).pipe(Effect.mapError(failure));
    }),
  ),
  t3_bot_secret: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { bots, bot } = yield* currentBot;
      return { file: yield* bots.secretPath(bot.id, input.key).pipe(Effect.mapError(failure)) };
    }),
  ),
  t3_bot_list: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      return yield* (yield* BotChat.BotChat).discover(input).pipe(Effect.mapError(failure));
    }),
  ),
});
