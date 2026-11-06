import { useLocation } from "@tanstack/react-router";

import { PULL_REQUESTS_PANEL_REF, WORKSPACE_PULL_REQUESTS_PANEL_REF } from "../../rightPanelStore";
import { workspaceFramePathname } from "../sidebar/mainAppLocation";

/** The Pull requests page's panel, kept separate when it is shown inside the workspace. */
export function usePullRequestsPanelRef() {
  const inWorkspace = useLocation({
    select: (location) => workspaceFramePathname(location.pathname) !== null,
  });
  return inWorkspace ? WORKSPACE_PULL_REQUESTS_PANEL_REF : PULL_REQUESTS_PANEL_REF;
}
