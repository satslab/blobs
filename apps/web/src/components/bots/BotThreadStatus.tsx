import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotDashedIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useUiStateStore } from "../../uiStateStore";
import { cn } from "../../lib/utils";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
  resolveWorkingStartedAt,
} from "../Sidebar.logic";
import { WorkingDuration } from "../sidebar/SidebarThreadRow";

const STATUS_ICONS = {
  working: CircleDashedIcon,
  waiting: CircleDotDashedIcon,
  input: MessageCircleQuestionIcon,
  approval: ShieldQuestionIcon,
  limited: CircleAlertIcon,
  failed: CircleAlertIcon,
  done: CircleCheckIcon,
} as const;

/** The status a thread row shows at its top right, for the bot's thread. */
export function BotThreadStatus({ thread }: { thread: EnvironmentThreadShell }) {
  const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
  const localLastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt);
  const status = resolveSidebarThreadStatus(thread);
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt });
  const shown =
    status === "working"
      ? {
          label: thread.goal?.status === "active" ? "Goal" : "Working",
          icon: STATUS_ICONS.working,
          className: "text-info",
        }
      : status === "waiting"
        ? { label: "Waiting", icon: STATUS_ICONS.waiting, className: "text-muted-foreground" }
        : status === "approval"
          ? {
              label: "Approval",
              icon: STATUS_ICONS.approval,
              className: "text-warning-foreground",
            }
          : status === "input"
            ? {
                label: "Input",
                icon: STATUS_ICONS.input,
                className: "text-indigo-600 dark:text-indigo-300",
              }
            : status === "limited"
              ? { label: "Limited", icon: STATUS_ICONS.limited, className: "text-warning" }
              : status === "failed"
                ? { label: "Failed", icon: STATUS_ICONS.failed, className: "text-error" }
                : isUnread
                  ? { label: "Done", icon: STATUS_ICONS.done, className: "text-success" }
                  : null;
  if (shown === null) return null;
  const Icon = shown.icon;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", shown.className)}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span role="status">{shown.label}</span>
      {status === "working" ? (
        <span aria-hidden>
          <WorkingDuration startedAt={resolveWorkingStartedAt(thread)} />
        </span>
      ) : status === "waiting" ? (
        <span aria-hidden>
          <WorkingDuration startedAt={thread.latestRun?.completedAt ?? null} />
        </span>
      ) : null}
    </span>
  );
}
