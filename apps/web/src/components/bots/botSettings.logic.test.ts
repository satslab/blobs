import { BotId, EnvironmentId, ProjectId, ThreadId, type BotIdentity } from "@satslab/contracts";
import { describe, expect, it } from "vite-plus/test";
import type {
  SidebarProjectSnapshot,
  SidebarProjectGroupMember,
} from "../../sidebarProjectGrouping";
import { resolveSettingsScope } from "../settings/settingsScope";
import {
  botSettingsSearchDestination,
  resolveBotSettingsGroup,
  resolveLegacyBotSettingsIdentity,
} from "./botSettings.logic";

const source = EnvironmentId.make("source");
const destination = EnvironmentId.make("destination");
const bot: BotIdentity = {
  id: BotId.make("bot"),
  name: "Bot",
  ownerEnvironmentId: source,
  threadId: ThreadId.make("root"),
  generation: 1,
  status: "active",
  destinationEnvironmentId: null,
};
function record(identity = bot, environmentId = identity.ownerEnvironmentId) {
  return { bot: identity, environmentId };
}
function member(environmentId: EnvironmentId, id = "project"): SidebarProjectGroupMember {
  return {
    id: ProjectId.make(id),
    environmentId,
    isBot: true,
    title: "Bot",
    workspaceRoot: `/bots/${id}`,
    physicalProjectKey: `${environmentId}:${id}`,
    environmentLabel: environmentId,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-23T00:00:00Z",
    updatedAt: "2026-10-23T00:00:00Z",
  };
}
const local = member(source);
const remote = member(destination);
const group: SidebarProjectSnapshot = {
  ...local,
  pinned: false,
  archived: false,
  projectKey: "bot-group",
  displayName: "Bot",
  memberProjects: [remote, local],
  memberProjectRefs: [
    { environmentId: source, projectId: local.id },
    { environmentId: destination, projectId: remote.id },
  ],
  groupedProjectCount: 2,
  environmentPresence: "mixed",
  allRemoteMembersAreDesktopLocal: false,
  allRemoteMembersAreWsl: false,
  remoteEnvironmentLabels: [],
};
const root = { environmentId: source, id: bot.threadId, projectId: local.id, botId: bot.id };

it("uses the bot's current root after a reset", () => {
  const reset = { ...bot, generation: 2, threadId: ThreadId.make("fresh-root") };
  expect(resolveBotSettingsGroup([group], reset, root)).toBeNull();
  expect(
    resolveBotSettingsGroup([group], reset, { ...root, id: reset.threadId })?.memberProjects,
  ).toEqual([local]);
});

describe("bot backing checkout", () => {
  it("pins a grouped selection to the physical owner and project", () => {
    const selected = resolveBotSettingsGroup([group], bot, root)!;
    expect(selected.memberProjects).toEqual([local]);
    const scope = resolveSettingsScope(
      { project: selected.projectKey, machine: source, checkout: local.physicalProjectKey },
      [group],
      [
        { environmentId: source, label: "Source" },
        { environmentId: destination, label: "Destination" },
      ],
    );
    expect(scope.kind).toBe("checkout");
    expect(scope.members).toEqual([local]);
    expect(scope.environmentIds).toEqual([source]);
  });
  it("does not broaden missing owner or checkout data to another group member", () => {
    expect(resolveBotSettingsGroup([group], bot, null)).toBeNull();
    expect(resolveBotSettingsGroup([group], bot, { ...root, botId: "another-bot" })).toBeNull();
    expect(
      resolveBotSettingsGroup([group], bot, { ...root, environmentId: destination }),
    ).toBeNull();
    expect(resolveBotSettingsGroup([{ ...group, memberProjects: [remote] }], bot, root)).toBeNull();
    const scope = resolveSettingsScope(
      { project: group.projectKey, machine: source, checkout: local.physicalProjectKey },
      [{ ...group, memberProjects: [remote] }],
      [{ environmentId: source, label: "Source" }],
    );
    expect(scope).toMatchObject({ kind: "unavailable", members: [], environmentIds: [] });
  });
  it("redirects legacy selections only with the exact owner, root, and backing project", () => {
    expect(resolveLegacyBotSettingsIdentity([record()], [local], [root])).toEqual(bot);
    expect(resolveLegacyBotSettingsIdentity([record()], [remote], [root])).toBeNull();
    expect(
      resolveLegacyBotSettingsIdentity([record()], [local], [{ ...root, id: "stale-root" }]),
    ).toBeNull();
    expect(
      resolveLegacyBotSettingsIdentity([record()], [{ ...local, isBot: false }], [root]),
    ).toBeNull();
  });
});

it("routes resource search to the selected bot or management without choosing another bot", () => {
  expect(botSettingsSearchDestination(bot)).toEqual({
    to: "/bots/settings/$environmentId/$botId",
    params: { environmentId: source, botId: bot.id },
    hash: "bot-load-resources",
  });
  expect(botSettingsSearchDestination(null)).toEqual({ to: "/settings/bots" });
});
