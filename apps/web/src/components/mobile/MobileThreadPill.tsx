import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@satslab/client-runtime/environment";
import type { EnvironmentThreadShell } from "@satslab/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@satslab/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope } from "@satslab/contracts";
import { useState } from "react";

import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { cn } from "~/lib/utils";
import { useEnvironment } from "../../state/environments";
import { useProject } from "../../state/entities";
import { readEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { ProjectFavicon } from "../ProjectFavicon";
import { botTaskState } from "../bots/BotWorkTab.logic";
import { canShareWithGuestAtom } from "../chat/guestShareAvailability";
import { toastManager } from "../ui/toast";

/**
 * The phone header's thread pill: project icon, title, and project · environment (· branch on a
 * worktree), with a dot while the agent works or waits on you. Tapping it opens the thread menu.
 */
export function MobileThreadPill({ thread }: { thread: EnvironmentThreadShell }) {
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const project = useProject({ environmentId: thread.environmentId, projectId: thread.projectId });
  const environment = useEnvironment(thread.environmentId);
  const canShareWithGuest = useAtomValue(canShareWithGuestAtom(thread.environmentId));
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  const { openMenu } = useThreadActionMenu({
    threadRef,
    projectCwd: project?.workspaceRoot ?? null,
    onStartRename: () => {
      if (readEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope))
        setRenaming(thread.title);
    },
    canShareWithGuest,
  });
  const commitRename = (title: string) => {
    setRenaming(null);
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
      return;
    }
    if (trimmed === thread.title) return;
    void updateThreadMetadata({
      environmentId: thread.environmentId,
      input: { threadId: thread.id, title: trimmed },
    }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    });
  };
  const state = botTaskState(thread.source);
  const details = [
    project ? (project.isScratch ? "No project" : project.title) : null,
    environment?.label ?? null,
    thread.worktreePath ? thread.branch : null,
  ].filter(Boolean);

  if (renaming !== null)
    return (
      <div className="glass-float flex h-12 min-w-0 flex-1 items-center rounded-full px-4">
        <input
          autoFocus
          value={renaming}
          aria-label="Thread title"
          onChange={(event) => setRenaming(event.currentTarget.value)}
          onBlur={(event) => commitRename(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setRenaming(null);
          }}
          className="min-w-0 flex-1 bg-transparent text-base font-medium outline-hidden"
        />
      </div>
    );
  return (
    <button
      type="button"
      aria-label={`${thread.title}, thread actions`}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        void openMenu({ x: bounds.left, y: bounds.bottom + 6 });
      }}
      className="glass-float flex h-12 min-w-0 items-center gap-2.5 rounded-full ps-3 pe-4 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {project ? <ProjectFavicon project={project} className="size-6 shrink-0" /> : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{thread.title}</span>
        {details.length > 0 ? (
          <span className="truncate text-xs text-muted-foreground">{details.join(" · ")}</span>
        ) : null}
      </span>
      {state === "running" || state === "waiting" ? (
        <span
          role="img"
          aria-label={state === "waiting" ? "Needs input" : "Working"}
          className={cn(
            "size-2 shrink-0 rounded-full",
            state === "waiting" ? "bg-warning" : "bg-primary",
          )}
        />
      ) : null}
    </button>
  );
}
