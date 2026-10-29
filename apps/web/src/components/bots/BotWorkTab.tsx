import { botTaskState } from "./BotWorkTab.logic";
import { useState } from "react";
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
import { PanelCard, PanelGroup, PanelList } from "./BotPanelParts";
import { BotFollowUps, BotSavedResources, useBotResources } from "./BotResourcesPanel";

// Finished work folds into a fixed-height list so history never pushes the routines off screen.
const EARLIER_LIMIT = 50;

type TaskThread = ReturnType<typeof useThreadRelationshipShells>[number];
type TaskKind = "agent" | "thread";

const STATE_DOT_CLASS = {
  running: "bg-info",
  waiting: "bg-warning",
  failed: "bg-destructive",
  done: undefined,
} as const;

/** Threads and subagents the bot started, newest first. */
function useBotTasks(bot: BotIdentity) {
  const shells = useThreadRelationshipShells(scopeThreadRef(bot.ownerEnvironmentId, bot.threadId));
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
      return kind === null ? [] : [{ thread, kind, state: botTaskState(thread) }];
    })
    .toSorted(
      (left, right) =>
        DateTime.toEpochMillis(right.thread.updatedAt) -
        DateTime.toEpochMillis(left.thread.updatedAt),
    );
  return { root, tasks };
}

type Task = ReturnType<typeof useBotTasks>["tasks"][number];

function TaskRows({
  bot,
  root,
  tasks,
}: {
  bot: BotIdentity;
  root: TaskThread | null;
  tasks: readonly Task[];
}) {
  const navigate = useNavigate();
  const projects = useProjects();
  const providers = useEnvironmentProviders().get(bot.ownerEnvironmentId);
  return (
    <PanelList>
      {tasks.map((task) => {
        const { thread, kind, state } = task;
        const FallbackIcon = kind === "agent" ? SparklesIcon : MessageSquareIcon;
        const provider = providers?.find((entry) => entry.instanceId === thread.providerInstanceId);
        const dotClass = STATE_DOT_CLASS[state];
        const projectName =
          kind === "thread"
            ? projects.find(
                (project) =>
                  project.environmentId === bot.ownerEnvironmentId &&
                  project.id === thread.projectId,
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
              className="flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => {
                const memory = resolveBotThreadContext(thread, root);
                void navigate({
                  to: memory ? "/bots/$environmentId/$threadId" : "/$environmentId/$threadId",
                  params: buildThreadRouteParams(scopeThreadRef(bot.ownerEnvironmentId, thread.id)),
                });
              }}
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
                className={cn(
                  "min-w-0 flex-1 truncate",
                  state === "done" && "text-muted-foreground",
                )}
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
      })}
    </PanelList>
  );
}

/** Finished tasks in a collapsible fixed-height list. */
function EarlierTasks({
  bot,
  root,
  tasks,
}: {
  bot: BotIdentity;
  root: TaskThread | null;
  tasks: readonly Task[];
}) {
  const [open, setOpen] = useState(true);
  const failedCount = tasks.filter((task) => task.state === "failed").length;
  return (
    <section className="space-y-1.5 px-4 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronDownIcon aria-hidden className={cn("size-3.5", !open && "-rotate-90")} />
        <span>Earlier · {tasks.length}</span>
        {failedCount > 0 && !open ? (
          <Badge variant="error" size="sm">
            {failedCount} failed
          </Badge>
        ) : null}
      </button>
      {open ? (
        <PanelCard>
          <ScrollArea scrollFade className="max-h-44">
            <TaskRows bot={bot} root={root} tasks={tasks} />
          </ScrollArea>
        </PanelCard>
      ) : null}
    </section>
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
    <div className="mx-3 mb-2.5 ml-5 space-y-3 border-l border-border/60 pl-4 text-sm">
      <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{task.prompt}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
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
function Routines({
  bot,
  scoped,
  tasks,
  refresh,
}: {
  bot: BotIdentity;
  scoped: boolean;
  tasks: readonly ScheduledTask[];
  refresh: () => void;
}) {
  const environmentId = bot.ownerEnvironmentId;
  const canOperate = useAtomValue(
    serverEnvironment.runScheduledTaskNow.permissionAtom(environmentId),
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
  return (
    <PanelGroup title="Routines" aside={tasks.length}>
      <PanelCard>
        <PanelList>
          {tasks.map((task) => {
            const open = openId === task.id;
            return (
              <li key={task.id}>
                <div className="flex min-h-11 items-center gap-2.5 pr-3 text-sm">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : task.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <CalendarClockIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn("block truncate", !task.enabled && "text-muted-foreground")}
                      >
                        {task.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {scheduleLabel(task.schedule)} ·{" "}
                        {task.enabled && task.nextRunAt !== null ? (
                          <ScheduledRelativeLabel value={task.nextRunAt} />
                        ) : (
                          "Paused"
                        )}
                      </span>
                    </span>
                    <ChevronDownIcon
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground",
                        !open && "-rotate-90",
                      )}
                    />
                  </button>
                  <Switch
                    size="sm"
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
                        refresh();
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
        </PanelList>
      </PanelCard>
      {editingTask && scoped ? (
        <ScheduledTaskEditorDialog
          initialEnvironmentId={environmentId}
          task={editingTask}
          onClose={() => {
            setEditingTask(null);
            refresh();
          }}
        />
      ) : null}
    </PanelGroup>
  );
}

export function BotWorkTab({
  bot,
  scoped,
  connected,
}: {
  bot: BotIdentity;
  scoped: boolean;
  connected: boolean;
}) {
  const { root, tasks } = useBotTasks(bot);
  const routinesQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId: bot.ownerEnvironmentId, input: {} }),
  );
  const routines = (routinesQuery.data?.tasks ?? []).filter(
    (task) => task.threadId === bot.threadId,
  );
  const resources = useBotResources(bot);
  const saved = resources.query.data;
  const followUps = saved?.followUps ?? [];
  const waiting = tasks.filter((task) => task.state === "waiting");
  const running = tasks.filter((task) => task.state === "running");
  const earlier = tasks
    .filter((task) => task.state === "done" || task.state === "failed")
    .slice(0, EARLIER_LIMIT);
  const errors = [
    routinesQuery.error === null ? null : `Could not load routines: ${routinesQuery.error}`,
    resources.query.error === null
      ? null
      : `Could not load follow-ups, skills and secrets: ${resources.query.error}`,
  ].filter((error) => error !== null);
  const loading =
    (routinesQuery.data === null && routinesQuery.error === null) ||
    (saved === null && resources.query.error === null);
  const empty =
    tasks.length === 0 &&
    routines.length === 0 &&
    followUps.length === 0 &&
    (saved?.skills.length ?? 0) === 0 &&
    (saved?.secrets.length ?? 0) === 0;
  return (
    <>
      {empty && errors.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-8 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground">
            <SparklesIcon aria-hidden className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            {loading ? (connected ? "Loading work…" : "Disconnected") : "No work yet"}
          </p>
        </div>
      ) : null}
      {errors.map((error) => (
        <p key={error} role="alert" className="px-7 pt-4 text-xs text-destructive">
          {error}
        </p>
      ))}
      {waiting.length > 0 ? (
        <PanelGroup title="Needs you" aside={waiting.length}>
          <PanelCard>
            <TaskRows bot={bot} root={root} tasks={waiting} />
          </PanelCard>
        </PanelGroup>
      ) : null}
      {running.length > 0 ? (
        <PanelGroup title="In progress" aside={`${running.length} running`}>
          <PanelCard>
            <TaskRows bot={bot} root={root} tasks={running} />
          </PanelCard>
        </PanelGroup>
      ) : null}
      {routines.length > 0 ? (
        <Routines bot={bot} scoped={scoped} tasks={routines} refresh={routinesQuery.refresh} />
      ) : null}
      {followUps.length > 0 ? <BotFollowUps items={followUps} resources={resources} /> : null}
      <BotSavedResources state={saved ?? { skills: [], secrets: [] }} resources={resources} />
      {earlier.length > 0 ? <EarlierTasks bot={bot} root={root} tasks={earlier} /> : null}
    </>
  );
}
