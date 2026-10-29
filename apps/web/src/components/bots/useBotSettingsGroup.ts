import type { BotIdentity } from "@satslab/contracts";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@satslab/client-runtime/state/project-grouping";
import { useClientSettings } from "../../hooks/useSettings";
import { useProjects, useQuietThreadShell } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useSettingsProjectGroups } from "../settings/useSettingsProjectGroups";
import { resolveBotSettingsGroup } from "./botSettings.logic";

/** The project group a bot's settings are scoped to, and whether its owning environment is connected. */
export function useBotSettingsGroup(bot: BotIdentity | null) {
  const root = useQuietThreadShell(
    bot ? { environmentId: bot.ownerEnvironmentId, threadId: bot.threadId } : null,
  );
  const projects = useProjects({ includeBot: true });
  const grouping = useClientSettings(selectProjectGroupingSettings);
  const project = projects.find(
    (candidate) =>
      candidate.environmentId === bot?.ownerEnvironmentId && candidate.id === root?.projectId,
  );
  const projectKey = project ? deriveLogicalProjectKeyFromSettings(project, grouping) : undefined;
  const groups = useSettingsProjectGroups(projectKey);
  const { environments } = useEnvironments();
  const connected = environments.some(
    (environment) =>
      environment.environmentId === bot?.ownerEnvironmentId &&
      environment.connection.phase === "connected",
  );
  return { group: resolveBotSettingsGroup(groups, bot, root), connected };
}
