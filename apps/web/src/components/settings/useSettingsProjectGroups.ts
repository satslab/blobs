import { isBotProject } from "@t3tools/shared/botChat";
import { useClientSettings } from "../../hooks/useSettings";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects } from "../../state/entities";

export function useSettingsProjectGroups(selectedProjectKey?: string) {
  const projects = useProjects({ includeBot: true });
  // Avoid object selector identities that rebuild settings groups on each write.
  const sidebarProjectGroupingMode = useClientSettings(
    (settings) => settings.sidebarProjectGroupingMode,
  );
  const sidebarProjectGroupingOverrides = useClientSettings(
    (settings) => settings.sidebarProjectGroupingOverrides,
  );
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const labels = new Map(environments.map((entry) => [entry.environmentId, entry.label]));
  return buildSidebarProjectSnapshots({
    projects,
    settings: { sidebarProjectGroupingMode, sidebarProjectGroupingOverrides },
    primaryEnvironmentId,
    resolveEnvironmentLabel: (id) => labels.get(id) ?? null,
  })
    .filter(
      (group) =>
        group.projectKey === selectedProjectKey || !group.memberProjects.some(isBotProject),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
