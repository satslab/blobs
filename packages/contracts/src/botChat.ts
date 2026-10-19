import { OrchestrationV2DomainEvent } from "./orchestrationV2.ts";
import { ApplicationProjectCreatedPayload } from "./applicationEvent.ts";
import { ThreadEnvMode } from "./environment.ts";
import { StoredProjectIcon } from "./project.ts";
import { ProjectSettingsOverrides } from "./settings.ts";
import * as Schema from "effect/Schema";
import { EnvironmentId, ThreadId, RunId, BotId } from "./baseSchemas.ts";

// These providers expose a built-in tool policy while preserving native MCP servers.
export const BOT_CHAT_PROVIDER_DRIVERS: ReadonlySet<string> = new Set([
  "codex",
  "claudeAgent",
  "pi",
]);

export const MemoryPart = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  count: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type MemoryPart = typeof MemoryPart.Type;
export const MemoryNode = Schema.Struct({ ...MemoryPart.fields, text: Schema.String });
export type MemoryNode = typeof MemoryNode.Type;
export const MemoryState = Schema.Struct({
  parts: Schema.Array(MemoryPart),
  pending: Schema.Boolean,
  revision: Schema.Int,
  compactParts: Schema.Array(MemoryPart),
  compactPending: Schema.Boolean,
  compactRevision: Schema.Int,
  total: Schema.Int,
  frontier: Schema.Int,
});
export type MemoryState = typeof MemoryState.Type;
export const BotIdentity = Schema.Struct({
  id: BotId,
  name: Schema.String,
  ownerEnvironmentId: EnvironmentId,
  threadId: ThreadId,
  generation: Schema.Int,
  status: Schema.Literals(["active", "transferring", "staged", "forwarded", "deleted"]),
  destinationEnvironmentId: Schema.NullOr(EnvironmentId),
});
export type BotIdentity = typeof BotIdentity.Type;
export const BotDiscoveryInput = Schema.Struct({
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  cursor: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
});
export type BotDiscoveryInput = typeof BotDiscoveryInput.Type;
export const BotDiscoveryResult = Schema.Struct({
  bots: Schema.Array(BotIdentity),
  nextCursor: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type BotDiscoveryResult = typeof BotDiscoveryResult.Type;

export const MemoryMessage = Schema.Struct({
  id: Schema.Int,
  key: Schema.String,
  kind: Schema.Literals(["user", "talk", "tool", "echo"]),
  text: Schema.String,
  date: Schema.String,
});
export type MemoryMessage = typeof MemoryMessage.Type;
export const MemoryJob = Schema.Struct({ ...MemoryPart.fields, source: Schema.String });
export type MemoryJob = typeof MemoryJob.Type;
export const MemorySnapshot = Schema.Struct({
  botId: BotId,
  runId: RunId,
  total: Schema.Int,
  view: Schema.String,
});
export type MemorySnapshot = typeof MemorySnapshot.Type;
export const BotMemoryInput = Schema.Struct({
  botId: BotId,
  section: Schema.Literals(["summary", "entries", "snapshots"]),
});
export type BotMemoryInput = typeof BotMemoryInput.Type;
/** A saved memory view measured as rendered; `bytes` is null while a line awaits its summary. */
export const BotMemoryView = Schema.Struct({
  name: Schema.Literals(["turn", "compaction"]),
  lines: Schema.Int,
  bytes: Schema.NullOr(Schema.Int),
  highBytes: Schema.Int,
  lowBytes: Schema.Int,
  pending: Schema.Boolean,
});
export type BotMemoryView = typeof BotMemoryView.Type;
export const BotMemoryResult = Schema.Struct({
  stats: Schema.Struct({
    entries: Schema.Int,
    summaries: Schema.Int,
    snapshots: Schema.Int,
    originalBytes: Schema.Int,
    queuedJobs: Schema.Int,
    runningJobs: Schema.Int,
    failedJobs: Schema.Int,
    pending: Schema.Boolean,
  }),
  views: Schema.Array(BotMemoryView),
  entries: Schema.Array(
    Schema.Struct({
      id: MemoryMessage.fields.id,
      kind: MemoryMessage.fields.kind,
      text: Schema.String,
      date: Schema.String,
      truncated: Schema.Boolean,
    }),
  ),
  snapshots: Schema.Array(
    Schema.Struct({
      runId: RunId,
      total: Schema.Int,
      view: Schema.String,
      truncated: Schema.Boolean,
    }),
  ),
});
export type BotMemoryResult = typeof BotMemoryResult.Type;

export class BotChatError extends Schema.TaggedError<BotChatError>()("BotChatError", {
  operation: Schema.String,
  reason: Schema.Literals([
    "storage",
    "not-found",
    "not-owner",
    "busy",
    "invalid-range",
    "not-ready",
    "inference",
    "invalid-transfer",
    "browser-secret",
  ]),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    switch (this.reason) {
      case "not-found":
        return "Bot identity was not found.";
      case "not-owner":
        return "This environment does not own this bot.";
      case "busy":
        return "Bot has an active turn or ownership transfer.";
      case "invalid-range":
        return "Use an aligned power-of-two range within the frozen memory.";
      case "not-ready":
        return "Memory summaries are not ready. Your history is saved; retry the turn.";
      case "inference":
        return "Memory compaction failed. Your history is saved; retry the turn.";
      case "invalid-transfer":
        return "Bot transfer state or ownership proof is invalid.";
      case "browser-secret":
        return "Could not fill that secret. Check the page origin and field before retrying.";
      case "storage":
        return "Bot storage operation failed.";
    }
  }
}
const BotResourceKey = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/));
export const BotFollowUp = Schema.Struct({
  key: BotResourceKey,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  note: Schema.String.check(Schema.isMaxLength(4096)),
  sourceUrl: Schema.String.check(Schema.isMaxLength(2048)),
  status: Schema.Literals(["open", "resolved"]),
});
export const BotSkill = Schema.Struct({
  key: BotResourceKey,
  description: Schema.String.check(Schema.isMaxLength(1024)),
});
export const BotCheckInSettings = Schema.Struct({
  enabled: Schema.Boolean,
  everyHours: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 24 })),
  timezone: Schema.String,
  quietStart: Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/)),
  quietEnd: Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/)),
  maxPerDay: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
});
export const DEFAULT_BOT_CHECK_IN: typeof BotCheckInSettings.Type = {
  enabled: false,
  everyHours: 4,
  timezone: "UTC",
  quietStart: "22:00",
  quietEnd: "08:00",
  maxPerDay: 3,
};
export const BotResources = Schema.Struct({
  followUps: Schema.Array(BotFollowUp),
  skills: Schema.Array(BotSkill),
  secrets: Schema.Array(Schema.Struct({ key: BotResourceKey })),
  checkIn: BotCheckInSettings,
  lastCheckIn: Schema.NullOr(Schema.Number),
});
export type BotResources = typeof BotResources.Type;
export const BotResourceAction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("follow-up.save"), item: BotFollowUp }),
  Schema.Struct({ type: Schema.Literal("follow-up.delete"), key: BotResourceKey }),
  Schema.Struct({
    type: Schema.Literal("skill.save"),
    ...BotSkill.fields,
    content: Schema.String.check(Schema.isMaxLength(65536)),
  }),
  Schema.Struct({ type: Schema.Literal("skill.delete"), key: BotResourceKey }),
  Schema.Struct({
    type: Schema.Literal("secret.save"),
    key: BotResourceKey,
    secretRef: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("secret.delete"), key: BotResourceKey }),
  Schema.Struct({ type: Schema.Literal("check-in.configure"), settings: BotCheckInSettings }),
]);
export type BotResourceAction = typeof BotResourceAction.Type;
export const BotResourceTransfer = Schema.Struct({
  state: BotResources,
  skills: Schema.Array(
    Schema.Struct({ ...BotSkill.fields, content: Schema.String.check(Schema.isMaxLength(65536)) }),
  ),
  encryptedSecrets: Schema.String,
});
export type BotResourceTransfer = typeof BotResourceTransfer.Type;

export const BotTransfer = Schema.Struct({
  resources: Schema.optionalKey(BotResourceTransfer),
  transferId: Schema.String,
  releaseHash: Schema.String,
  identity: BotIdentity,
  destinationEnvironmentId: EnvironmentId,
  state: MemoryState,
  messages: Schema.Array(MemoryMessage),
  nodes: Schema.Array(MemoryNode),
  jobs: Schema.Array(MemoryJob),
  snapshots: Schema.Array(MemorySnapshot),
  events: Schema.Array(OrchestrationV2DomainEvent),
  project: Schema.Struct({
    defaultModelSelection: ApplicationProjectCreatedPayload.fields.defaultModelSelection,
    defaultThreadEnvMode: Schema.NullOr(ThreadEnvMode),
    autoPull: Schema.Boolean,
    projectIcon: Schema.NullOr(StoredProjectIcon),
    scripts: ApplicationProjectCreatedPayload.fields.scripts,
    settingsOverrides: ProjectSettingsOverrides,
  }),
});
export type BotTransfer = typeof BotTransfer.Type;

/** A staged transfer is never authoritative while its source is still visible. */
export function selectBotIdentities(identities: readonly BotIdentity[]) {
  const selected = new Map<BotId, BotIdentity>();
  for (const bot of identities) {
    const previous = selected.get(bot.id);
    if (
      previous === undefined ||
      (previous.status === "staged" && bot.status !== "staged") ||
      ((previous.status === "staged") === (bot.status === "staged") &&
        (bot.generation > previous.generation ||
          (bot.generation === previous.generation && bot.status === "active")))
    )
      selected.set(bot.id, bot);
  }
  return [...selected.values()];
}
