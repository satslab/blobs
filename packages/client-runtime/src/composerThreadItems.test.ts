import { BotId, EnvironmentId, ThreadId } from "@satslab/contracts";
import { expect, it } from "vite-plus/test";

import { matchComposerThreadItems, type ComposerThreadCandidate } from "./composerThreadItems.ts";

const environmentId = EnvironmentId.make("env-composer");

function shell(
  id: string,
  title: string,
  overrides: Partial<ComposerThreadCandidate> = {},
): ComposerThreadCandidate {
  return {
    environmentId,
    id: ThreadId.make(id),
    title,
    branch: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    latestUserMessageAt: null,
    opens: null,
    archivedAt: null,
    deletedAt: null,
    lineage: { rootThreadId: ThreadId.make(id), parentThreadId: null, relationshipToParent: null },
    ...overrides,
  };
}

it("ranks thread mentions like the palette and leaves out subagent threads", () => {
  const items = matchComposerThreadItems({
    shells: [
      shell("newer-mid-word", "Remodel the settings page", {
        updatedAt: "2026-10-20T00:00:00.000Z",
      }),
      shell("word", "Fix model picker"),
      shell("subagent", "Model review", {
        lineage: {
          rootThreadId: ThreadId.make("word"),
          parentThreadId: ThreadId.make("word"),
          relationshipToParent: "subagent",
        },
      }),
      shell("other-environment", "Model docs", { environmentId: EnvironmentId.make("env-other") }),
    ],
    environmentId,
    excludeThreadId: null,
    query: "model",
    now: Date.parse("2026-10-23T00:00:00.000Z"),
  });
  expect(items.map((item) => item.thread.threadId)).toEqual(["word", "newer-mid-word"]);
});

const bot = shell("polaris-thread", "Polaris", {
  botId: BotId.make("polaris"),
  environmentId,
  archivedAt: null,
  updatedAt: "2026-10-23T00:00:00Z",
});
const ordinary = { ...bot, id: ThreadId.make("ordinary"), botId: undefined, title: "Ordinary" };
const match = (query: string) =>
  matchComposerThreadItems({
    shells: [
      ordinary,
      bot,
      { ...bot, id: ThreadId.make("foreign"), environmentId: EnvironmentId.make("remote") },
    ],
    environmentId,
    excludeThreadId: null,
    query,
    now: Date.parse("2026-10-24"),
  });

it("offers local bots when @ opens and matches their names without case sensitivity", () => {
  expect(match("").map((item) => item.label)).toEqual(["Polaris"]);
  expect(match("pOl")[0]).toMatchObject({
    isBot: true,
    description: "Bot",
    thread: { environmentId, threadId: bot.id },
  });
  expect(match("Ord")[0]).toMatchObject({ description: "Thread", label: "Ordinary" });
});
it("excludes the current bot and archived or deleted bot conversations", () => {
  expect(
    matchComposerThreadItems({
      shells: [
        bot,
        { ...bot, id: ThreadId.make("archived"), archivedAt: bot.updatedAt },
        { ...bot, id: ThreadId.make("deleted"), deletedAt: bot.updatedAt },
      ],
      environmentId,
      excludeThreadId: bot.id,
      query: "Pol",
      now: Date.parse("2026-10-24"),
    }),
  ).toEqual([]);
});
