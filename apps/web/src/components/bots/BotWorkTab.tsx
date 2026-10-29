import { useState, type ReactNode } from "react";
import { DateTime } from "effect";
import { useNavigate } from "@tanstack/react-router";
import {
  AuthOrchestrationOperateScope,
  type BotIdentity,
  type ScheduledTask,
} from "@satslab/contracts";
import { scopeThreadRef } from "@satslab/client-runtime/environment";
import {
  CalendarClockIcon,
  ChevronDownIcon,
  PencilIcon,
  PlayIcon,
  MessageSquareIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { resolveBotThreadContext } from "../../botThreadContext";
import { cn } from "../../lib/utils";
import { useAtomValue } from "@effect/atom-react";
import { useProjects, useThreadRelationshipShells } from "../../state/entities";
import { useEnvironmentProviders } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { readEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatElapsedDurationLabel, formatRelativeTimeLabel } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import {
  ScheduledRelativeLabel,
  scheduleLabel,
  ScheduledTaskEditorDialog,
} from "../settings/ScheduledTasksSettings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import { PanelEmpty, PanelSection } from "./BotPanelParts";

// Finished work folds into a fixed-height list so history never pushes the routines off screen.
const EARLIER_LIMIT = 50;

type TaskThread = ReturnType<typeof useThreadRelationshipShells>[number];
type TaskKind = "agent" | "thread";

function taskState(thread: TaskThread) {
  if (thread.pendingRuntimeRequest !== null) return "waiting" as const;
  if (thread.activityRunStatus != null) return "running" as const;
  return thread.status === "failed" ? ("failed" as const) : ("done" as const);
}

const STATE_DOT_CLASS = {
  running: "bg-info",
  waiting: "bg-warning",
  failed: "bg-destructive",
  done: undefined,
} as const;

function TaskGroupHeader({
  title,
  detail,
  aside,
  onClick,
  expanded,
}: {
  title: string;
  detail?: string;
  aside?: ReactNode;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const content = (
    <>
      <span className="font-medium text-foreground">{title}</span>
      {detail ? <span>{detail}</span> : null}
      {aside ? <span className="ml-auto flex items-center gap-1.5">{aside}</span> : null}
      {onClick ? (
        <ChevronDownIcon
          aria-hidden
          className={cn("size-3.5", !aside && "ml-auto", !expanded && "-rotate-90")}
        />
      ) : null}
    </>
  );
  const className =
    "mt-2 flex h-7 w-full items-center gap-1.5 text-xs text-muted-foreground first:mt-0";
  return onClick ? (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className={cn(
        className,
        "outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** Threads and subagents the bot started: what needs you or is running, then a bounded history. */
function TasksAndThreads({ bot }: { bot: BotIdentity }) {
  const navigate = useNavigate();
  const [earlierOpen, setEarlierOpen] = useState(false);
  const shells = useThreadRelationshipShells(scopeThreadRef(bot.ownerEnvironmentId, bot.threadId));
  const projects = useProjects();
  const providers = useEnvironmentProviders().get(bot.ownerEnvironmentId);
  const root = shells.find((thread) => thread.id === bot.threadId) ?? null;
  const tasks = shells
    .flatMap((thread) => {
      const kind: TaskKind | null =
        thread.id === bot.threadId
          ? null
          : thread.lineage.relationshipToParent === "subagent" &&
              thread.lineage.parentThreadId === bot.threadId
            ? "agent"
            : thread.launchedByThreadId === bot.threadId
              ? "thread"
              : null;
      return kind === null ? [] : [{ thread, kind, state: taskState(thread) }];
    })
    .toSorted(
      (left, right) =>
        DateTime.toEpochMillis(right.thread.updatedAt) -
        DateTime.toEpochMillis(left.thread.updatedAt),
    );
  const waiting = tasks.filter((task) => task.state === "waiting");
  const runningAgents = tasks.filter((task) => task.state === "running" && task.kind === "agent");
  const runningThreads = tasks.filter((task) => task.state === "running" && task.kind === "thread");
  const earlier = tasks
    .filter((task) => task.state === "done" || task.state === "failed")
    .slice(0, EARLIER_LIMIT);
  const failedCount = earlier.filter((task) => task.state === "failed").length;
  const open = (thread: TaskThread) => {
    const memory = resolveBotThreadContext(thread, root);
    void navigate({
      to: memory ? "/bots/$environmentId/$threadId" : "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(bot.ownerEnvironmentId, thread.id)),
    });
  };
  const renderRow = (task: (typeof tasks)[number]) => {
    const { thread, kind, state } = task;
    const FallbackIcon = kind === "agent" ? SparklesIcon : MessageSquareIcon;
    const provider = providers?.find((entry) => entry.instanceId === thread.providerInstanceId);
    const dotClass = STATE_DOT_CLASS[state];
    const projectName =
      kind === "thread"
        ? projects.find(
            (project) =>
              project.environmentId === bot.ownerEnvironmentId && project.id === thread.projectId,
          )?.title
        : undefined;
    const time =
      state === "running" && thread.activityRunStartedAt
        ? formatElapsedDurationLabel(DateTime.formatIso(thread.activityRunStartedAt))
        : formatRelativeTimeLabel(DateTime.formatIso(thread.updatedAt));
    return (
      <li key={thread.id}>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => open(thread)}
        >
          <span className="relative flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {provider ? (
              <ProviderInstanceIcon
                driverKind={provider.driver}
                displayName={provider.displayName ?? provider.driver}
                acpRegistryIconUrl={provider.iconUrl}
                iconClassName="size-3.5"
                className="z-auto"
              />
            ) : (
              <FallbackIcon aria-hidden className="size-3.5" />
            )}
            {dotClass ? (
              <span
                aria-hidden
                className={cn(
                  "absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-background",
                  dotClass,
                )}
              />
            ) : null}
          </span>
          <span
            className={cn("min-w-0 flex-1 truncate", state === "done" && "text-muted-foreground")}
          >
            {thread.title}
          </span>
          {projectName ? (
            <span className="flex max-w-28 min-w-0 shrink overflow-hidden">
              <Badge variant="outline" size="sm">
                {projectName}
              </Badge>
            </span>
          ) : null}
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              state === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {state === "failed" ? `Failed · ${time}` : state === "waiting" ? "Needs you" : time}
          </span>
        </button>
      </li>
    );
  };
  return (
    <PanelSection title="Tasks and threads">
      {tasks.length === 0 ? <PanelEmpty>No tasks or threads yet</PanelEmpty> : null}
      {waiting.length > 0 ? (
        <>
          <TaskGroupHeader title="Needs attention" detail={String(waiting.length)} />
          <ul className="m-0 -mx-2 list-none p-0">{waiting.map(renderRow)}</ul>
        </>
      ) : null}
      {runningAgents.length > 0 ? (
        <>
          <TaskGroupHeader title="Agents" detail={`${runningAgents.length} running`} />
          <ul className="m-0 -mx-2 list-none p-0">{runningAgents.map(renderRow)}</ul>
        </>
      ) : null}
      {runningThreads.length > 0 ? (
        <>
          <TaskGroupHeader title="Threads" detail={`${runningThreads.length} running`} />
          <ul className="m-0 -mx-2 list-none p-0">{runningThreads.map(renderRow)}</ul>
        </>
      ) : null}
      {earlier.length > 0 ? (
        <>
          <TaskGroupHeader
            title="Earlier"
            detail={String(earlier.length)}
            expanded={earlierOpen}
            onClick={() => setEarlierOpen((value) => !value)}
            aside={
              failedCount > 0 && !earlierOpen ? (
                <Badge variant="error" size="sm">
                  {failedCount} failed
                </Badge>
              ) : null
            }
          />
          {earlierOpen ? (
            <ScrollArea scrollFade className="-mx-2 max-h-44 w-[calc(100%+1rem)]">
              <ul className="m-0 list-none p-0">{earlier.map(renderRow)}</ul>
            </ScrollArea>
          ) : null}
        </>
      ) : null}
    </PanelSection>
  );
}

const RUN_STATUS_LABEL = {
  never: "Never run",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
} as const;

function formatRunTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RoutineDetails({
  task,
  canOperate,
  canEdit,
  canDelete,
  busy,
  onRun,
  onEdit,
  onDelete,
}: {
  task: ScheduledTask;
  canOperate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mb-2 ml-6 space-y-3 border-l border-border/60 pl-4 text-sm">
      <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{task.prompt}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Schedule</dt>
        <dd>{scheduleLabel(task.schedule)}</dd>
        <dt className="text-muted-foreground">Next run</dt>
        <dd>
          {task.enabled && task.nextRunAt !== null ? formatRunTime(task.nextRunAt) : "Paused"}
        </dd>
        <dt className="text-muted-foreground">Last run</dt>
        <dd className={task.lastRunStatus === "failed" ? "text-destructive" : undefined}>
          {RUN_STATUS_LABEL[task.lastRunStatus]}
          {task.lastRunAt !== null ? ` · ${formatRelativeTimeLabel(task.lastRunAt)}` : ""}
        </dd>
        <dt className="text-muted-foreground">Runs</dt>
        <dd className="tabular-nums">{task.runCount}</dd>
      </dl>
      {task.lastRunError ? (
        <p className="line-clamp-3 text-destructive">{task.lastRunError}</p>
      ) : null}
      <div className="flex items-center gap-1.5">
        {task.schedule.type === "webhook" ? null : (
          <Button
            size="xs"
            variant="outline"
            disabled={!canOperate || busy || task.lastRunStatus === "running"}
            onClick={onRun}
          >
            <PlayIcon />
            Run now
          </Button>
        )}
        <Button size="xs" variant="ghost" disabled={!canEdit || busy} onClick={onEdit}>
          <PencilIcon />
          Edit
        </Button>
        <Button
          size="xs"
          variant="ghost-destructive"
          disabled={!canDelete || busy}
          onClick={onDelete}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </div>
  );
}

/** Schedules the bot made: click one for its details, flip the switch to pause it. */
function Routines({ bot, scoped }: { bot: BotIdentity; scoped: boolean }) {
  const environmentId = bot.ownerEnvironmentId;
  const canOperate = useAtomValue(
    serverEnvironment.runScheduledTaskNow.permissionAtom(environmentId),
  );
  const query = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const canEdit = useAtomValue(serverEnvironment.upsertScheduledTask.permissionAtom(environmentId));
  const canDelete = useAtomValue(
    serverEnvironment.deleteScheduledTask.permissionAtom(environmentId),
  );
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "bot routine delete",
  });
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const setEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "bot routine toggle",
  });
  const runNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "bot routine run now",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const tasks = (query.data?.tasks ?? []).filter((task) => task.threadId === bot.threadId);
  return (
    <PanelSection
      title="Routines"
      aside={
        tasks.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
        ) : null
      }
    >
      {query.error !== null ? (
        <p className="py-1.5 text-xs text-destructive">Could not load routines: {query.error}</p>
      ) : tasks.length === 0 ? (
        <PanelEmpty>No routines</PanelEmpty>
      ) : null}
      <ul className="m-0 list-none p-0">
        {tasks.map((task) => {
          const open = openId === task.id;
          return (
            <li key={task.id}>
              <div className="flex h-9 items-center gap-2.5 text-sm">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : task.id)}
                  className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <CalendarClockIcon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {task.enabled && task.nextRunAt !== null ? (
                      <ScheduledRelativeLabel value={task.nextRunAt} />
                    ) : (
                      "Paused"
                    )}
                  </span>
                  <ChevronDownIcon
                    aria-hidden
                    className={cn("size-3.5 shrink-0 text-muted-foreground", !open && "-rotate-90")}
                  />
                </button>
                <Switch
                  checked={task.enabled}
                  disabled={
                    !canOperate ||
                    busyId !== null ||
                    !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
                  }
                  aria-label={task.enabled ? `Pause ${task.title}` : `Resume ${task.title}`}
                  onCheckedChange={async (enabled) => {
                    setBusyId(task.id);
                    await setEnabled({ environmentId, input: { id: task.id, enabled } });
                    setBusyId(null);
                  }}
                />
              </div>
              {open ? (
                <RoutineDetails
                  task={task}
                  canOperate={canOperate}
                  canEdit={scoped && canEdit}
                  canDelete={canDelete}
                  busy={busyId !== null}
                  onEdit={() => setEditingTask(task)}
                  onDelete={async () => {
                    setBusyId(task.id);
                    const result = await remove({ environmentId, input: { id: task.id } });
                    setBusyId(null);
                    if (result._tag === "Success") {
                      setOpenId(null);
                      query.refresh();
                    }
                  }}
                  onRun={async () => {
                    setBusyId(task.id);
                    await runNow({ environmentId, input: { id: task.id } });
                    setBusyId(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {editingTask && scoped ? (
        <ScheduledTaskEditorDialog
          initialEnvironmentId={environmentId}
          task={editingTask}
          onClose={() => {
            setEditingTask(null);
            query.refresh();
          }}
        />
      ) : null}
    </PanelSection>
  );
}

export function BotWorkTab({ bot, scoped }: { bot: BotIdentity; scoped: boolean }) {
  return (
    <>
      <TasksAndThreads bot={bot} />
      <Routines bot={bot} scoped={scoped} />
    </>
  );
}
