import { closestCenter, DndContext, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EnvironmentId, ThreadId, type BotIdentity } from "@satslab/contracts";
import { scopeThreadRef, scopedThreadKey } from "@satslab/client-runtime/environment";
import { Navigate, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AppWindowIcon,
  CheckIcon,
  BotIcon,
  MessageCircleIcon,
  WorkflowIcon,
  ChartNoAxesColumnIcon,
  MessagesSquareIcon,
  PinIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
} from "../../keybindings";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { cn } from "../../lib/utils";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { usePullRequestsSupported } from "../../state/environments";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  hasUnseenCompletion,
  resolveThreadLastVisitedAt,
  useThreadJumpHintsVisible,
} from "../Sidebar.logic";
import { useUiStateStore } from "../../uiStateStore";
import { SidebarPointerSensor } from "../Sidebar.pointer";
import { useBots, useLastBotId, useOpenServerThreadBotContext } from "../../state/bots";
import { useProject, useQuietThreadShell, useThreadRelationshipShells } from "../../state/entities";
import { useThreadActionMenu } from "../../hooks/useThreadActionMenu";
import ChatView from "../ChatView";
import { ThreadRightPanel } from "../chat/ThreadRightPanel";
import { BotAvatar } from "../bots/BotAvatar";
import {
  BotActionsProvider,
  runBotMenuAction,
  useBotActions,
  useBotMenuDisabled,
} from "../bots/BotActions";
import { buildBotMenuItems } from "../bots/BotMenu.logic";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import {
  isAppModalPage,
  navigateToThreads,
  workspaceFramePathname,
} from "../sidebar/mainAppLocation";
import { botDockState, botTaskState } from "../bots/BotWorkTab.logic";
import { useBotOrder, type BotRow } from "../bots/useBotOrder";
import { BotTaskList, useBotTasks } from "../bots/BotWorkTab";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarProvider } from "../ui/sidebar";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BotOverview } from "../bots/BotRightPanel";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { NewBotDraft } from "./NewBotDraft";

const WORKSPACE_CONTENT_VARS = {
  // Turn navigation sits just left of the chat column instead of at the window edge.
  "--timeline-minimap-inset": "max(0px, calc((100% - var(--chat-content-max-width)) / 2 - 4.5rem))",
  // Page headers line up with the readable page column (max-w-4xl, px-6) instead of the edge.
  "--workspace-titlebar-content-left": "max(1.5rem, calc((100% - 56rem) / 2 + 1.5rem))",
} as CSSProperties;

// The computer's first tab starts just past its sheet's rounded top-left corner.
const COMPUTER_CONTENT_VARS = {
  "--workspace-titlebar-content-left": "0.75rem",
} as CSSProperties;

// The Pull requests header lines up with its wider list column (max-w-6xl, px-6).
const PULL_REQUESTS_CONTENT_VARS = {
  "--workspace-titlebar-content-left": "max(1.5rem, calc((100% - 72rem) / 2 + 1.5rem))",
} as CSSProperties;

/** Opens a bot's chat in the workspace and remembers it for the next visit. */
type BotPageView = "chat" | "computer" | "overview";

// Each bot's last view this session, so switching bots and back returns to it.
const lastBotViews = new Map<string, BotPageView>();

/** Opens a bot in the given view, or the view it was last left in. */
function useOpenBot() {
  const navigate = useNavigate();
  const [, setLastBotId] = useLastBotId();
  return (bot: BotIdentity, requested?: BotPageView) => {
    const view = requested ?? lastBotViews.get(bot.id) ?? "chat";
    setLastBotId(bot.id);
    lastBotViews.set(bot.id, view);
    if (view === "overview")
      void navigate({
        to: "/bots/overview/$environmentId/$botId",
        params: { environmentId: bot.ownerEnvironmentId, botId: bot.id },
      });
    else
      void navigate({
        to:
          view === "computer"
            ? "/bots/computer/$environmentId/$threadId"
            : "/bots/$environmentId/$threadId",
        params: { environmentId: bot.ownerEnvironmentId, threadId: bot.threadId },
      });
  };
}

type WorkspaceTarget =
  | { kind: "index" }
  | { kind: "new" }
  | { kind: "settings"; environmentId: string; botId: string }
  | { kind: "overview"; environmentId: string; botId: string }
  | { kind: "chat"; environmentId: EnvironmentId; threadId: ThreadId }
  | { kind: "computer"; environmentId: EnvironmentId; threadId: ThreadId };

function parseWorkspacePath(pathname: string): WorkspaceTarget {
  const [first, second, third] = pathname.split("/").slice(2).map(decodeURIComponent);
  if (first === "new") return { kind: "new" };
  if ((first === "settings" || first === "overview") && second && third)
    return { kind: first, environmentId: second, botId: third };
  if (first === "computer" && second && third)
    return {
      kind: "computer",
      environmentId: EnvironmentId.make(second),
      threadId: ThreadId.make(third),
    };
  if (first && second)
    return {
      kind: "chat",
      environmentId: EnvironmentId.make(first),
      threadId: ThreadId.make(second),
    };
  return { kind: "index" };
}

/**
 * The workspace frame: bots on the left, the page for the URL, utilities on the right. It draws
 * the page itself rather than through routes, so the chat stays mounted behind Settings and Usage.
 */
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const order = useBotOrder();
  // Same list as the /bots sidebar, so its order writes line up with ours.
  const rows = [...order.pinned, ...order.active];
  const bots = rows.map((row) => row.bot);
  const sortableIds = [
    ...order.pinned.map((row) => row.bot.id),
    PIN_BOUNDARY,
    ...order.active.map((row) => row.bot.id),
  ];
  const navigate = useNavigate();
  const openBot = useOpenBot();
  const pathname = useLocation({ select: (location) => location.pathname });
  const framePathname = workspaceFramePathname(pathname) ?? "/bots";
  const modalOpen = isAppModalPage(pathname);
  // Pull requests take the page's place; Settings and Usage open over it.
  const routedPage = pathname === "/pull-requests";
  const target = parseWorkspacePath(framePathname);
  // Pull requests keep the bot that was open, since closing them returns to it.
  const drafting = target.kind === "new";
  // Subagent conversations belong to their bot, so it stays selected while one is open.
  const chatBot = useOpenServerThreadBotContext(
    target.kind === "chat" || target.kind === "computer"
      ? scopeThreadRef(target.environmentId, target.threadId)
      : null,
  );
  const selectedId =
    target.kind === "settings" || target.kind === "overview" ? target.botId : chatBot?.botId;
  const selectedBot = bots.find((bot) => bot.id === selectedId && bot.status === "active");
  const [workOpen, setWorkOpen] = useState(false);
  const currentView: BotPageView | null = routedPage
    ? null
    : target.kind === "computer"
      ? "computer"
      : target.kind === "overview" || target.kind === "settings"
        ? "overview"
        : target.kind === "chat"
          ? "chat"
          : null;
  // Remembers where the current bot was left, even when it was reached by URL or history.
  const switchToBot = (bot: BotIdentity) => {
    if (selectedBot && currentView) lastBotViews.set(selectedBot.id, currentView);
    openBot(bot);
  };
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcutContext = {
    terminalFocus: isTerminalFocused(),
    terminalOpen: false,
    modelPickerOpen: isModelPickerOpen(),
    isWeb: !isElectron,
    isDesktop: isElectron,
  };
  const showJumpHints = useThreadJumpHintsVisible(
    shouldShowThreadJumpHintsForModifiers(useShortcutModifierState(), keybindings, {
      platform: navigator.platform,
      context: shortcutContext,
    }),
  );
  const jumpLabel = (index: number) => {
    const command = threadJumpCommandForIndex(index);
    return showJumpHints && command ? shortcutLabelForCommand(keybindings, command) : null;
  };
  // oxlint-disable-next-line blobs/no-unreasoned-state-sync -- subscribes to window keydown for the same numbered jump shortcuts as the thread sidebar
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        modalOpen ||
        event.defaultPrevented ||
        event.repeat ||
        isCommandPaletteOpen() ||
        isModelPickerOpen()
      )
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: false,
          modelPickerOpen: false,
          isWeb: !isElectron,
          isDesktop: isElectron,
        },
      });
      const index = threadJumpIndexFromCommand(command ?? "");
      const target = index === null ? undefined : bots[index];
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      switchToBot(target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bots, keybindings, modalOpen, switchToBot]);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(SidebarPointerSensor, {
      distance: 6,
      onAttach: () => {},
      onFinish: () => setDragging(false),
    }),
  );
  // Dropping on a pinned bot pins the dragged one there; on an unpinned bot, unpins it.
  // Only crossing the boundary pins or unpins; sorting on one side keeps the pin state.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    const source = rows.find((row) => row.bot.id === active.id);
    if (order.busy || !source || !over || active.id === over.id) return;
    const next = arrayMove(
      sortableIds,
      sortableIds.indexOf(source.bot.id),
      sortableIds.indexOf(String(over.id)),
    );
    const boundary = next.indexOf(PIN_BOUNDARY);
    const destinationPinned = next.indexOf(source.bot.id) < boundary;
    const section = destinationPinned ? next.slice(0, boundary) : next.slice(boundary + 1);
    void order.applyOrder(
      source,
      destinationPinned,
      section.flatMap((id) => rows.filter((row) => row.bot.id === id)),
    );
  };
  return (
    <BotActionsProvider>
      <SidebarProvider defaultOpen={false} className="h-dvh! min-h-0!">
        <div
          className={cn(
            "relative flex h-full min-h-0 w-full text-foreground",
            // The computer draws itself as a sheet on window chrome, which the dock shares.
            !routedPage && target.kind === "computer" ? "bg-accent" : "bg-background",
          )}
        >
          <div className="relative flex shrink-0 flex-col">
            <nav
              aria-label="Bots"
              // Padded by the utilities' height on both ends, so bots center on the whole dock.
              className="group/dock flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto py-42 pr-1 pl-3"
            >
              <DndContext
                sensors={sensors}
                modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                // The 1px pin boundary never wins an overlap test, so pick the nearest center.
                collisionDetection={closestCenter}
                onDragStart={() => setDragging(true)}
                onDragCancel={() => setDragging(false)}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  {order.pinned.length > 0 ? null : <PinBoundary visible={dragging} />}
                  {rows.map((row, index) => (
                    <Fragment key={row.bot.id}>
                      <DockBot
                        row={row}
                        jumpLabel={jumpLabel(index)}
                        selected={row.bot.id === selectedId}
                        chatOpen={!routedPage && target.kind === "chat"}
                        onSelect={() => switchToBot(row.bot)}
                        onTogglePin={() => {
                          if (!order.busy) void order.togglePin(row);
                        }}
                      />
                      {index === order.pinned.length - 1 ? <PinBoundary visible /> : null}
                    </Fragment>
                  ))}
                </SortableContext>
              </DndContext>
              <NewBotDockButton
                selected={drafting}
                onClick={() => void navigate({ to: "/bots/new" })}
              />
            </nav>
            <WorkspaceUtilities pullRequestsOpen={routedPage} returnPathname={framePathname} />
          </div>
          <main
            className="flex min-w-0 flex-1 flex-col"
            style={
              routedPage
                ? PULL_REQUESTS_CONTENT_VARS
                : target.kind === "computer"
                  ? COMPUTER_CONTENT_VARS
                  : WORKSPACE_CONTENT_VARS
            }
          >
            {routedPage ? (
              children
            ) : (
              <WorkspaceTargetPage
                target={target}
                background={modalOpen}
                workBot={selectedBot ?? null}
                onOpenWork={() => setWorkOpen(true)}
              />
            )}
          </main>
          {routedPage ? null : children}
          {selectedBot ? (
            <div className="absolute top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col items-center gap-3">
              <BotViewSwitcher
                bot={selectedBot}
                onSubagent={target.kind === "chat" && target.threadId !== selectedBot.threadId}
                view={
                  routedPage
                    ? null
                    : target.kind === "overview" || target.kind === "settings"
                      ? "overview"
                      : target.kind === "computer"
                        ? "computer"
                        : "chat"
                }
              />
              <BotTasksButton bot={selectedBot} open={workOpen} onOpenChange={setWorkOpen} />
            </div>
          ) : null}
        </div>
      </SidebarProvider>
    </BotActionsProvider>
  );
}

/**
 * Bottom of the bot dock. Settings and Usage open over the
 * workspace; Pull requests toggles in place of its page.
 */
function WorkspaceUtilities({
  pullRequestsOpen,
  returnPathname,
}: {
  pullRequestsOpen: boolean;
  /** Where closing Pull requests goes back to. */
  returnPathname: string;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const pullRequestsSupported = usePullRequestsSupported();
  return (
    <aside
      aria-label="Utilities"
      className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 pr-1 pl-3"
    >
      <UtilityButton label="Threads" onClick={() => void navigateToThreads(router)}>
        <MessagesSquareIcon />
      </UtilityButton>
      {pullRequestsSupported ? (
        <UtilityButton
          label="Pull requests"
          active={pullRequestsOpen}
          onClick={() =>
            void (pullRequestsOpen
              ? navigate({ href: returnPathname })
              : navigate({ to: "/pull-requests", search: readPullRequestListPreferences() }))
          }
        >
          <PullRequestGlyph.pullRequest />
        </UtilityButton>
      ) : null}
      <UtilityButton label="Usage" onClick={() => void navigate({ to: "/usage" })}>
        <ChartNoAxesColumnIcon />
      </UtilityButton>
      <UtilityButton label="Settings" onClick={() => void navigate({ to: "/settings" })}>
        <SettingsIcon />
      </UtilityButton>
    </aside>
  );
}

function UtilityButton({
  label,
  side = "right",
  active = false,
  onClick,
  children,
}: {
  label: string;
  side?: "left" | "right";
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            variant="ghost-muted"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            data-pressed={active ? "" : undefined}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side={side}>{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * A glass pill near the right edge, over the page: switches the main view between the selected
 * bot's chat, computer, and page. None is active while Pull requests hold the page.
 */
function BotViewSwitcher({
  bot,
  view,
  onSubagent,
}: {
  bot: BotIdentity;
  view: BotPageView | null;
  /** A subagent's chat is open, so Chat goes back to the bot's own. */
  onSubagent: boolean;
}) {
  const openBot = useOpenBot();
  const show = (next: BotPageView) => {
    if (next !== view || (next === "chat" && onSubagent)) openBot(bot, next);
  };
  return (
    <div
      role="toolbar"
      aria-label="Bot view"
      className="dropdown-glass flex flex-col gap-1.5 rounded-full p-1.5 shadow-lg not-dark:glass-white"
    >
      <ViewToggle label="Chat" active={view === "chat"} onClick={() => show("chat")}>
        <MessageCircleIcon />
      </ViewToggle>
      <ViewToggle label="Computer" active={view === "computer"} onClick={() => show("computer")}>
        <AppWindowIcon />
      </ViewToggle>
      <ViewToggle label="Bot" active={view === "overview"} onClick={() => show("overview")}>
        <BotIcon />
      </ViewToggle>
    </div>
  );
}

/**
 * Sits under the view switcher: the bot's subagents and threads in a popover, with a count of
 * the ones that need you, or else of the ones running.
 */
function BotTasksButton({
  bot,
  open,
  onOpenChange: setOpen,
}: {
  bot: BotIdentity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tasks } = useBotTasks(bot);
  const waiting = tasks.filter((task) => task.state === "waiting").length;
  const running = tasks.filter((task) => task.state === "running").length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="Subagents and threads"
                  className={cn(
                    "dropdown-glass relative grid size-12 place-items-center rounded-full shadow-lg not-dark:glass-white outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4",
                    open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                />
              }
            />
          }
        >
          <WorkflowIcon />
          {waiting > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-warning px-1 text-2xs leading-5 font-semibold text-warning-foreground ring-2 ring-background">
              {waiting}
            </span>
          ) : running > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-foreground px-1 text-2xs leading-5 font-semibold text-background ring-2 ring-background">
              {running}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="left">Subagents and threads</TooltipPopup>
      </Tooltip>
      <PopoverPopup side="left" align="center" sideOffset={12} padding="none" width="lg" arrow>
        <div className="max-h-[min(28rem,60dvh)] overflow-y-auto">
          <BotTaskList bot={bot} onOpen={() => setOpen(false)} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function ViewToggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "grid size-9 place-items-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4",
              active
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="left">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** Shows while the pointer is over the bot list, while focused, or while a new bot is open. */
function NewBotDockButton({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <div
      className={cn(
        "relative transition-opacity",
        !selected &&
          "opacity-0 group-hover/dock:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      {selected ? <SelectedMark /> : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="New bot"
              aria-current={selected ? "page" : undefined}
              onClick={onClick}
              className={cn(
                "grid size-10 place-items-center rounded-full border border-dashed text-muted-foreground outline-hidden hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4",
                selected ? "border-foreground/40 bg-accent text-foreground" : "border-border",
              )}
            />
          }
        >
          <PlusIcon />
        </TooltipTrigger>
        <TooltipPopup side="right">New bot</TooltipPopup>
      </Tooltip>
    </div>
  );
}

const PIN_BOUNDARY = "pin-boundary";

/** Bots above the line are pinned. With no pins it sits on top, shown only while dragging. */
function PinBoundary({ visible }: { visible: boolean }) {
  const { setNodeRef, transform, transition } = useSortable({
    id: PIN_BOUNDARY,
    disabled: { draggable: true },
  });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("mx-auto h-px w-6 shrink-0 bg-border", !visible && "opacity-0")}
    />
  );
}

function SelectedMark() {
  return (
    <span className="absolute top-1/2 -left-2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-foreground" />
  );
}

function DockBot({
  row,
  jumpLabel,
  selected,
  chatOpen,
  onSelect,
  onTogglePin,
}: {
  row: BotRow;
  jumpLabel: string | null;
  selected: boolean;
  /** Whether the selected bot's chat is showing; if not, clicking it goes back to the chat. */
  chatOpen: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const { bot } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bot.id,
  });
  const ref = scopeThreadRef(bot.ownerEnvironmentId, bot.threadId);
  // Includes the bot's own thread, its subagents, and the threads it launched.
  const threads = useThreadRelationshipShells(ref);
  const showMenu = useBotMenu(row, onTogglePin);
  const key = scopedThreadKey(ref);
  const localLastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[key]);
  const lastVisitedAt = resolveThreadLastVisitedAt(row.thread?.lastVisitedAt, localLastVisitedAt);
  const status = botDockState(
    threads,
    row.thread !== undefined && hasUnseenCompletion({ ...row.thread, lastVisitedAt }),
  );
  const statusLabel =
    status === "waiting"
      ? "Needs input"
      : status === "running"
        ? "Working"
        : status === "done"
          ? "Done"
          : "Idle";
  const StatusIcon = status === "waiting" ? MessageCircleIcon : CheckIcon;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      className={cn("relative touch-none", isDragging && "z-10")}
    >
      {selected ? <SelectedMark /> : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`${bot.name}, ${statusLabel}`}
              aria-current={selected ? "page" : undefined}
              onClick={(event) => {
                if (!selected || !chatOpen) return onSelect();
                const bounds = event.currentTarget.getBoundingClientRect();
                showMenu({ x: bounds.right + 8, y: bounds.top });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                showMenu({ x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  showMenu({ x: bounds.right + 8, y: bounds.top });
                }
              }}
              className={cn(
                "block rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                !selected && "opacity-70 hover:opacity-100",
              )}
            />
          }
        >
          <BotAvatar
            botId={bot.id}
            working={threads.some((thread) => botTaskState(thread) === "running")}
            className="size-10 rounded-full"
          />
        </TooltipTrigger>
        <TooltipPopup side="right">
          {bot.name} · {statusLabel}
        </TooltipPopup>
      </Tooltip>
      {(status === "waiting" || status === "done") && (
        <span
          role="img"
          aria-label={statusLabel}
          className={cn(
            "pointer-events-none absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full ring-2 ring-background",
            status === "waiting" ? "bg-warning text-warning-foreground" : "bg-success text-white",
          )}
        >
          <StatusIcon className="size-2.5" />
        </span>
      )}
      {jumpLabel ? (
        <Kbd className="pointer-events-none absolute -bottom-1 -left-1">{jumpLabel}</Kbd>
      ) : null}
      {row.pinned ? (
        <span
          aria-label="Pinned"
          className="pointer-events-none absolute -right-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-background text-muted-foreground shadow-xs ring-1 ring-border"
        >
          <PinIcon className="size-2.5" />
        </span>
      ) : null}
    </div>
  );
}

/** The same bot menu as the /bots sidebar item and chat header. */
function useBotMenu({ bot, thread, pinned }: BotRow, onTogglePin: () => void) {
  const ref = scopeThreadRef(bot.ownerEnvironmentId, bot.threadId);
  const navigate = useNavigate();
  const actions = useBotActions();
  const disabled = useBotMenuDisabled(bot);
  const project = useProject(
    thread ? { environmentId: thread.environmentId, projectId: thread.projectId } : null,
  );
  const { openMenu } = useThreadActionMenu({
    threadRef: ref,
    projectCwd: project?.workspaceRoot ?? null,
    onStartRename: () => {},
    canShareWithGuest: false,
    actions: ["copy"],
  });
  return (position: { x: number; y: number }) => {
    const paused = actions.paused(bot);
    void openMenu(position, {
      // The bot's page holds its settings, so this replaces the shared "Bot settings" item.
      items: buildBotMenuItems({
        pinned,
        disabled,
        busy: actions.busy !== null,
        canMove: actions.canMove(bot),
        paused: paused
          ? paused.bot.status === "transferring"
            ? "transferring"
            : "forwarded"
          : null,
      }).toSpliced(1, 0, { id: "settings", label: "Bot settings", icon: "settings" }),
      sharedItemsIndex: 1,
      onSelect: (action) => {
        if (action === "pin") onTogglePin();
        else if (action === "settings")
          void navigate({
            to: "/bots/overview/$environmentId/$botId",
            params: { environmentId: bot.ownerEnvironmentId, botId: bot.id },
          });
        else runBotMenuAction(actions, bot, action);
      },
    });
  };
}

function WorkspaceTargetPage({
  target,
  background,
  workBot,
  onOpenWork,
}: {
  target: WorkspaceTarget;
  background: boolean;
  workBot: BotIdentity | null;
  onOpenWork: () => void;
}) {
  switch (target.kind) {
    case "index":
      return <WorkspaceIndex background={background} />;
    case "new":
      return <WorkspaceNewBot />;
    case "settings":
      // Settings live on the bot's page now; old links land there, keeping any section anchor.
      return (
        <Navigate
          to="/bots/overview/$environmentId/$botId"
          params={{ environmentId: target.environmentId, botId: target.botId }}
          hash
          replace
        />
      );
    case "overview":
      return <WorkspaceBotOverview botId={target.botId} />;
    case "chat":
      return (
        <WorkspaceBotChat
          environmentId={target.environmentId}
          threadId={target.threadId}
          workBot={workBot}
          onOpenWork={onOpenWork}
        />
      );
    case "computer":
      return (
        <WorkspaceBotComputer environmentId={target.environmentId} threadId={target.threadId} />
      );
  }
}

/** `/workspace`: back to the last bot, or a new one when there are none. */
function WorkspaceIndex({ background }: { background: boolean }) {
  const bots = useBots().filter((bot) => bot.status === "active");
  const [lastBotId] = useLastBotId();
  const bot = bots.find((item) => item.id === lastBotId) ?? bots[0];
  if (!bot) return <WorkspaceNewBot />;
  // Behind a modal the URL belongs to the modal, so show the chat without redirecting.
  if (background)
    return (
      <WorkspaceBotChat
        environmentId={bot.ownerEnvironmentId}
        threadId={bot.threadId}
        workBot={null}
        onOpenWork={() => undefined}
      />
    );
  return (
    <Navigate
      to="/bots/$environmentId/$threadId"
      params={{ environmentId: bot.ownerEnvironmentId, threadId: bot.threadId }}
      replace
    />
  );
}

function WorkspaceNewBot() {
  const navigate = useNavigate();
  const openBot = useOpenBot();
  return (
    <NewBotDraft
      onCreated={(bot) => openBot(bot, "chat")}
      onCancel={() => void navigate({ to: "/bots" })}
    />
  );
}

/** Everything the bot panel used to hold, on one page in place of the chat. */
function WorkspaceBotOverview({ botId }: { botId: string }) {
  const openBot = useOpenBot();
  const bot = useBots().find((item) => item.id === botId);
  const back = () => {
    if (bot) openBot(bot, "chat");
  };
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) back();
      }}
    >
      <div className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
        <WorkspacePageContainer className="pt-12 pb-16">
          {bot ? <BotOverview key={`${bot.ownerEnvironmentId}:${bot.id}`} bot={bot} /> : null}
        </WorkspacePageContainer>
      </div>
    </div>
  );
}

/** The bot thread's computer: its browser, terminal, file, and diff tabs as one page. */
function WorkspaceBotComputer({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const ref = scopeThreadRef(environmentId, threadId);
  const thread = useQuietThreadShell(ref);
  const [layoutElement, setLayoutElement] = useState<HTMLElement | null>(null);
  if (!thread) return null;
  return (
    <div key={threadId} className="flex min-h-0 min-w-0 flex-1 p-1">
      <div ref={setLayoutElement} className="flex min-h-0 min-w-0 flex-1">
        <ThreadRightPanel
          threadRef={ref}
          thread={thread}
          isServerThread
          isBotThread
          open
          sheet={false}
          maximized
          workspaceLayoutElement={layoutElement}
          onCloseSheet={() => undefined}
          layoutControls={null}
          tabLook="folder"
        />
      </div>
    </div>
  );
}

function WorkspaceBotChat({
  environmentId,
  threadId,
  workBot,
  onOpenWork,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  /** The selected bot, whose running subagents and threads show at the end of the chat. */
  workBot: BotIdentity | null;
  onOpenWork: () => void;
}) {
  const navigate = useNavigate();
  const running = useBotTasks(workBot).tasks.filter((task) => task.state === "running").length;
  // The embedded chat has no diff panel or terminal of its own yet.
  const parentPanel = {
    openToolDiff: () =>
      toastManager.add({ type: "warning", title: "Diffs aren't available in bot chats yet" }),
    runShellCommand: () =>
      toastManager.add({
        type: "warning",
        title: "Shell commands aren't available in bot chats yet",
      }),
  };
  return (
    <div key={threadId} data-side-chat-pane className="flex min-h-0 flex-1 flex-col">
      <ChatView
        environmentId={environmentId}
        threadId={threadId}
        routeKind="server"
        reserveTitleBarControlInset={false}
        embedded={parentPanel}
        floatingPreview={{
          onOpenInPanel: () =>
            void navigate({
              to: "/bots/computer/$environmentId/$threadId",
              params: { environmentId, threadId },
            }),
          // Clears the floating view dock at the right edge.
          insetEnd: 72,
        }}
        runningWork={{ count: running, onOpen: onOpenWork }}
      />
    </div>
  );
}
