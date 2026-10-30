import * as BotSecretRequests from "../../../bots/BotSecretRequests.ts";
import { BrowserSecretFillInput } from "../../../bots/BrowserSecretFill.ts";
import * as PreviewAutomationBroker from "../../PreviewAutomationBroker.ts";
import * as SecretRequests from "../../../secrets/SecretRequests.ts";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import {
  BotResources,
  BotResourceKey,
  OrchestratorMcpRequestSecretInput,
  BotResourceAction,
  BotDiscoveryInput,
  BotDiscoveryResult,
  OrchestratorMcpFailure,
} from "@satslab/contracts";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";
import * as BotChat from "../../../bots/BotChat.ts";
import * as MemoryAccess from "../../../bots/MemoryAccess.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [MemoryAccess.MemoryAccess, McpInvocationContext.McpInvocationContext],
};
const index = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const MemoryToolkit = Toolkit.make(
  Tool.make("zoom", {
    ...shared,
    description:
      "Open an aligned power-of-two range of this turn's frozen memory. n=1 returns the complete original; larger ranges return their two child summaries.",
    parameters: Schema.Struct({ id: index, n: Schema.Int.check(Schema.isGreaterThan(0)) }),
    success: Schema.String,
  }).annotate(Tool.Readonly, true),
  Tool.make("date", {
    ...shared,
    description: "Read the timestamp of an original message in this turn's frozen memory.",
    parameters: Schema.Struct({ id: index }),
    success: Schema.String,
  }).annotate(Tool.Readonly, true),
);

export const BotDiscoveryToolkit = Toolkit.make(
  Tool.make("t3_bot_request_secret", {
    description:
      "Ask the user for a named secret in a private card and save it to this bot automatically. Supply a stable key for later t3_bot_secret or t3_bot_browser_fill_secret calls. Returns status and key, never the value or a secretRef. Only the bot itself can ask; subagents must ask their bot to request it.",
    parameters: Schema.Struct({
      label: OrchestratorMcpRequestSecretInput.fields.label,
      reason: OrchestratorMcpRequestSecretInput.fields.reason,
      placeholder: OrchestratorMcpRequestSecretInput.fields.placeholder,
      timeoutMs: OrchestratorMcpRequestSecretInput.fields.timeoutMs,
      clientRequestId: OrchestratorMcpRequestSecretInput.fields.clientRequestId,
      key: BotResourceKey,
    }),
    success: Schema.Struct({
      status: Schema.Literals(["saved", "declined", "cancelled", "timed_out"]),
      key: BotResourceKey,
    }),
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      BotSecretRequests.BotSecretRequests,
      SecretRequests.SecretRequests,
      Threads.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  }).annotate(McpSchema.EnabledWhen, McpInvocationContext.botSecretRequestsEnabled),
  Tool.make("t3_bot_resources", {
    description:
      "Read this bot's follow-ups, saved skills, secret names and check-in settings. Supply action to save or delete an entry or configure check-ins. Skills are Markdown files at skills/<key>.md in this bot's workspace. Use t3_bot_request_secret to request and automatically save a named secret. Never put a secret value in an action. Only the bot's own conversation can use this tool.",
    parameters: Schema.Struct({ action: Schema.optional(BotResourceAction) }),
    success: BotResources,
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      BotChat.BotChat,
      SecretRequests.SecretRequests,
      Threads.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  }),
  Tool.make("t3_bot_browser_fill_secret", {
    description:
      "Fill one browser field with a saved bot secret by key, without returning the value to the model. Open the browser tab first. Supply its explicit tabId, a CSS selector matching exactly one editable input, and the expected HTTP(S) origin (scheme, host, optional port; no path). The origin is checked inside the same page evaluation as the fill. Does not submit the form. Only this bot's own conversation can use its secrets.",
    parameters: BrowserSecretFillInput,
    success: Schema.Struct({ status: Schema.Literal("filled") }),
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      BotChat.BotChat,
      PreviewAutomationBroker.PreviewAutomationBroker,
      Threads.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  }),
  Tool.make("t3_bot_secret", {
    description:
      "Get the owner-only file path of a saved secret by key for this bot. Read the file inside a shell command without printing its contents. Returns a path, never the secret value.",
    parameters: Schema.Struct({ key: Schema.String }),
    success: Schema.Struct({ file: Schema.String }),
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      BotChat.BotChat,
      SecretRequests.SecretRequests,
      Threads.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  }),
  Tool.make("t3_bot_list", {
    description:
      "Discover active bots owned by this environment, optionally searching by name. Returns each bot's name, ID, and current threadId. Send a message with t3_thread_send using that threadId, or read its conversation with t3_thread_read. Pagination uses nextCursor. Messages appear as sent by another agent, just like messages between ordinary threads.",
    parameters: BotDiscoveryInput,
    success: BotDiscoveryResult,
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      BotChat.BotChat,
      SecretRequests.SecretRequests,
      Threads.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  })
    .annotate(Tool.Title, "List bots")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
);
