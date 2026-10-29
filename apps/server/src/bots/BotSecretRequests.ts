import { OrchestratorMcpFailure, type OrchestratorMcpRequestSecretInput } from "@satslab/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as BotChat from "./BotChat.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as OrchestratorMcpService from "../mcp/OrchestratorMcpService.ts";

const make = Effect.gen(function* () {
  const bots = yield* BotChat.BotChat;
  const secrets = yield* OrchestratorMcpService.OrchestratorMcpService;
  const request = Effect.fn("BotSecretRequests.request")(function* (
    scope: McpInvocationContext.McpInvocationScope,
    input: Omit<OrchestratorMcpRequestSecretInput, "delivery"> & { key: string },
  ) {
    const caller = yield* McpInvocationContext.requireThreadScope(scope, "Request a bot secret");
    if (caller.thread.subagent === true || caller.thread.botThreadId !== undefined) {
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "Only the bot's own conversation can request secrets. Ask the bot to request it.",
      });
    }
    const bot = yield* bots
      .forThread(caller.thread.threadId)
      .pipe(
        Effect.mapError(
          (error) =>
            new OrchestratorMcpFailure({ code: "invalid_request", message: error.message }),
        ),
      );
    if (!bot)
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "This tool requires the bot's own conversation.",
      });
    yield* bots
      .assertOwner(bot.id)
      .pipe(
        Effect.mapError(
          (error) =>
            new OrchestratorMcpFailure({ code: "invalid_request", message: error.message }),
        ),
      );
    const result = yield* secrets.requestSecret(scope, { ...input, delivery: "secretRef" });
    if (result.status !== "saved") return { status: result.status, key: input.key };
    if (!("secretRef" in result))
      return yield* new OrchestratorMcpFailure({
        code: "orchestration_error",
        message: "The secret request did not return a reference.",
      });
    yield* bots
      .changeResources(bot.id, { type: "secret.save", key: input.key, secretRef: result.secretRef })
      .pipe(
        Effect.mapError(
          (error) =>
            new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message }),
        ),
      );
    return { status: "saved" as const, key: input.key };
  });
  return { request };
});

export class BotSecretRequests extends Context.Service<
  BotSecretRequests,
  Effect.Success<typeof make>
>()("@satslab/blobs/bots/BotSecretRequests") {}
export const layer = Layer.effect(BotSecretRequests, make);
