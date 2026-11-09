import { scopeThreadRef } from "@satslab/client-runtime/environment";
import type { ScopedThreadRef } from "@satslab/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  BotIcon,
  ChevronLeftIcon,
  MenuIcon,
  MessagesSquareIcon,
  SquarePenIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { syncBrowserChromeTheme } from "../../hooks/useTheme";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { startNewThreadFromContext } from "../../lib/chatThreadActions";
import { cn } from "../../lib/utils";
import { useBots, useOpenServerThreadBotContext } from "../../state/bots";
import { useQuietThreadShell } from "../../state/entities";
import { BackgroundThreadAnnouncer } from "../BackgroundThreadAnnouncer";
import ThreadSidebar from "../Sidebar";
import { BotAvatar } from "../bots/BotAvatar";
import { BotActionsProvider } from "../bots/BotActions";
import { BotSidebar } from "../bots/BotSidebar";
import { SidebarModeContext, type SidebarMode } from "../sidebar/SidebarChrome";
import {
  isAppModalPage,
  useCloseAppModal,
  workspaceFramePathname,
} from "../sidebar/mainAppLocation";
import type { SidebarRouteReveal } from "../sidebar/routeReveal";
import { SidebarProvider, useSidebar } from "../ui/sidebar";
import { parseWorkspacePath, WorkspaceTargetPage } from "../workspace/WorkspacePage";
import { MobileContextMenuSheet } from "./MobileContextMenuSheet";
import { MobileSegmented } from "./MobileSegmented";
import { MobileThreadPill } from "./MobileThreadPill";
import { MobileUsageLink } from "./MobileUsageLink";
import {
  followVisualViewport,
  publishVisualViewport,
  MobileShellContext,
  MobileSidebarPresentationContext,
} from "./mobileLayout";

// A flick faster than this (px per ms) settles the drawer the way it was thrown.
const FLICK_VELOCITY = 0.4;

/**
 * The phone frame. The drawer is always mounted underneath; the chat sits on top and slides
 * right, keeping its width, to reveal it.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <BotActionsProvider>
      {/* Sidebar rows close the drawer through the provider's mobile state. */}
      <SidebarProvider defaultOpen={false} className="h-dvh! min-h-0!">
        <MobileShellContext value>
          <MobileFrame>{children}</MobileFrame>
        </MobileShellContext>
      </SidebarProvider>
    </BotActionsProvider>
  );
}

function MobileFrame({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const framePathname = workspaceFramePathname(pathname);
  const routeMode: SidebarMode = framePathname === null ? "threads" : "bots";
  const [listMode, setListMode] = useState(routeMode);
  const [lastRouteMode, setLastRouteMode] = useState(routeMode);
  if (routeMode !== lastRouteMode) {
    setLastRouteMode(routeMode);
    setListMode(routeMode);
  }
  const { openMobile: drawerOpen, setOpenMobile: setDrawerOpen } = useSidebar();
  // The chat keeps its rounded corners until it has slid all the way back.
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(drawerOpen);
  if (wasOpen !== drawerOpen) {
    setWasOpen(drawerOpen);
    setClosing(!drawerOpen);
  }
  const [routeReveal] = useState<SidebarRouteReveal>(() => ({
    observedKey: null,
    pendingKey: null,
  }));
  const chatRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    base: number;
    width: number;
    horizontal: boolean | null;
    offset: number;
    lastX: number;
    lastTime: number;
    velocity: number;
  } | null>(null);
  // The chat follows the finger, then settles open or closed by position and speed.
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    const chat = chatRef.current;
    // Horizontally scrolling content keeps its own swipes.
    if (!touch || !chat || (!drawerOpen && hasHorizontalScroll(event.target))) {
      drag.current = null;
      return;
    }
    const width = (chat.offsetWidth * 5) / 6;
    const base = drawerOpen ? width : 0;
    drag.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      base,
      width,
      horizontal: null,
      offset: base,
      lastX: touch.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  };
  const onTouchMove = (event: TouchEvent) => {
    const state = drag.current;
    const touch = event.touches[0];
    const chat = chatRef.current;
    if (!state || !touch || !chat) return;
    const dx = touch.clientX - state.startX;
    if (state.horizontal === null) {
      const dy = touch.clientY - state.startY;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!state.horizontal) return;
    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.velocity = (touch.clientX - state.lastX) / elapsed;
    state.lastX = touch.clientX;
    state.lastTime = event.timeStamp;
    state.offset = Math.min(state.width, Math.max(0, state.base + dx));
    chat.style.transition = "none";
    chat.toggleAttribute("data-sliding", true);
    // `translate`, the property the open class sets, so the finger replaces it rather than adding.
    chat.style.translate = `${state.offset}px 0`;
  };
  const onTouchEnd = () => {
    const state = drag.current;
    const chat = chatRef.current;
    drag.current = null;
    if (!state?.horizontal || !chat) return;
    const open =
      state.velocity > FLICK_VELOCITY
        ? true
        : state.velocity < -FLICK_VELOCITY
          ? false
          : state.offset > state.width / 2;
    // Handing the position back to the class animates from where the finger let go.
    chat.style.transition = "";
    chat.style.translate = "";
    // Already flush, so no transition will end to square the corners.
    if (!open && state.offset === 0) chat.removeAttribute("data-sliding");
    setDrawerOpen(open);
  };

  return (
    <div
      ref={pinToVisualViewport}
      data-mobile-frame=""
      // Fixed to the visual viewport, so the page never scrolls: an open keyboard would otherwise
      // push the header off screen, and iOS blurs whatever scrolls under its status bar.
      className="fixed inset-x-0 top-0 h-dvh w-full overflow-hidden bg-background text-foreground"
    >
      <aside
        aria-label={listMode === "bots" ? "Bots" : "Threads"}
        inert={!drawerOpen}
        // Bot rows are plain links that don't close the drawer themselves.
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("a[href]"))
            setDrawerOpen(false);
        }}
        className="absolute inset-y-0 left-0 isolate flex w-5/6 flex-col pt-safe pb-safe pl-safe text-foreground in-data-[keyboard-open]:pb-0!"
      >
        <SidebarModeContext value={listMode}>
          <MobileSidebarPresentationContext value="drawer">
            {/* With the lists' own header padding, this centers the search row on the chat's
                floating menu button. */}
            <div className="-mt-0.5 flex min-h-0 flex-1 flex-col">
              {listMode === "bots" ? <BotSidebar /> : <ThreadSidebar routeReveal={routeReveal} />}
            </div>
          </MobileSidebarPresentationContext>
        </SidebarModeContext>
        {/* Its bottom inset centers the bar on the chat's composer pill beside it. */}
        <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-4.25 in-data-[keyboard-open]:pb-2.25">
          <MobileSegmented
            label="List"
            size="lg"
            iconOnly
            options={LIST_MODES}
            value={listMode}
            onChange={setListMode}
            className="flex-1"
          />
          <MobileUsageLink />
          <NewButton mode={listMode} onStart={() => setDrawerOpen(false)} />
        </div>
      </aside>
      <div
        ref={chatRef}
        data-mobile-shell=""
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || drawerOpen) return;
          event.currentTarget.removeAttribute("data-sliding");
          setClosing(false);
        }}
        className={cn(
          // The timeline's top spacer is the header's height, so the first message clears it.
          "absolute inset-0 flex flex-col overflow-hidden data-sliding:rounded-l-display data-sliding:slide-lift bg-background [--mobile-header-height:calc(env(safe-area-inset-top)+3.75rem)] [--workspace-titlebar-scroll-fade-height:var(--mobile-header-height)] transition-transform duration-200 ease-out motion-reduce:transition-none",
          drawerOpen && "translate-x-5/6",
          // Off-center, the chat reads as a card lifted over the drawer.
          (drawerOpen || closing) && "rounded-l-display slide-lift",
        )}
      >
        <MobileHeader
          framePathname={framePathname}
          appModalPage={isAppModalPage(pathname)}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <div
          inert={drawerOpen}
          className={cn(
            // Its own layer, so pages and the chat behind them stay under the floating header.
            "isolate flex min-h-0 flex-1 flex-col",
            // Chats scroll under the floating header; other pages start below it.
            !floatsUnderHeader(pathname, framePathname) && "pt-(--mobile-header-height)",
          )}
        >
          {framePathname === null ? (
            children
          ) : (
            <>
              <WorkspaceTargetPage
                target={parseWorkspacePath(framePathname)}
                background={isAppModalPage(pathname)}
                workBot={null}
                onOpenWork={() => undefined}
              />
              {children}
            </>
          )}
        </div>
        {drawerOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 z-50 cursor-default"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}
      </div>
      <MobileContextMenuSheet />
      <BackgroundThreadAnnouncer />
    </div>
  );
}

/** Pins the frame to the visible screen and points the status bar colour at it. */
function pinToVisualViewport(frame: HTMLDivElement | null) {
  syncBrowserChromeTheme();
  const stopFollowing = frame ? followVisualViewport(frame) : undefined;
  const stopPublishing = frame ? publishVisualViewport() : undefined;
  document.documentElement.toggleAttribute("data-phone-layout", frame !== null);
  return () => {
    document.documentElement.removeAttribute("data-phone-layout");
    stopFollowing?.();
    stopPublishing?.();
    // The next frame is the classic shell, whose surfaces set the colour again.
    requestAnimationFrame(syncBrowserChromeTheme);
  };
}

/** Whether the page is a chat, whose timeline leaves room for the header itself. */
function floatsUnderHeader(pathname: string, framePathname: string | null) {
  if (framePathname === null) return pathname !== "/pull-requests" && pathname !== "/new";
  const kind = parseWorkspacePath(framePathname).kind;
  return kind === "chat" || kind === "index";
}

/** Starts a thread or a bot, whichever list the drawer shows. */
function NewButton({ mode, onStart }: { mode: SidebarMode; onStart: () => void }) {
  const navigate = useNavigate();
  const newThreadContext = useHandleNewThread();
  return (
    <button
      type="button"
      aria-label={mode === "bots" ? "New bot" : "New thread"}
      onClick={() => {
        onStart();
        if (mode === "bots") {
          void navigate({ to: "/bots/new" });
          return;
        }
        void startNewThreadFromContext({
          activeDraftThread: newThreadContext.activeDraftThread,
          activeThread: newThreadContext.activeThread ?? undefined,
          defaultProjectRef: newThreadContext.defaultProjectRef,
          handleNewThread: newThreadContext.handleNewThread,
        }).then((started) => {
          if (!started) openCommandPalette({ open: "new-thread-in" });
        });
      }}
      className="glass-float grid size-13 shrink-0 place-items-center rounded-full text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <SquarePenIcon className="size-5.5" />
    </button>
  );
}

function hasHorizontalScroll(target: EventTarget) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
  }
  return false;
}

const LIST_MODES = [
  { value: "bots", label: "Bots", Icon: BotIcon },
  { value: "threads", label: "Threads", Icon: MessagesSquareIcon },
] as const;

/** Menu on the left, what's open on the right. Pages like Usage go back instead. */
function MobileHeader({
  framePathname,
  appModalPage,
  onOpenDrawer,
}: {
  framePathname: string | null;
  appModalPage: boolean;
  onOpenDrawer: () => void;
}) {
  const closeAppModal = useCloseAppModal();
  const routeTarget = useThreadRouteTarget();
  const workspaceTarget = framePathname === null ? null : parseWorkspacePath(framePathname);
  const botThreadRef =
    workspaceTarget?.kind === "chat" || workspaceTarget?.kind === "computer"
      ? scopeThreadRef(workspaceTarget.environmentId, workspaceTarget.threadId)
      : null;
  const threadRef: ScopedThreadRef | null =
    botThreadRef ?? (routeTarget?.kind === "server" ? routeTarget.threadRef : null);
  const thread = useQuietThreadShell(threadRef);
  const botContext = useOpenServerThreadBotContext(botThreadRef);
  const botId =
    workspaceTarget?.kind === "overview" || workspaceTarget?.kind === "settings"
      ? workspaceTarget.botId
      : botContext?.botId;
  const bot = useBots().find((item) => item.id === botId);
  // A bot's own thread is titled after it; a subagent keeps its own title.
  const title =
    bot && (!thread || thread.id === bot.threadId)
      ? bot.name
      : (thread?.title ?? (routeTarget?.kind === "draft" ? "New thread" : null));
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-safe *:*:pointer-events-auto">
      <div className="flex h-15 items-center justify-between gap-3">
        <button
          type="button"
          aria-label={appModalPage ? "Back" : "Open menu"}
          onClick={appModalPage ? () => void closeAppModal() : onOpenDrawer}
          className="glass-float grid size-12 shrink-0 place-items-center rounded-full text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {appModalPage ? (
            <ChevronLeftIcon className="size-5.5" />
          ) : (
            <MenuIcon className="size-5" />
          )}
        </button>
        {/* A page over the chat brings its own controls, so the chat's pill leaves room for them. */}
        {appModalPage ? null : thread && !bot ? (
          <MobileThreadPill thread={thread} />
        ) : title ? (
          <div className="glass-float flex h-12 min-w-0 items-center gap-2 rounded-full px-4 text-base font-medium">
            {bot ? <BotAvatar botId={bot.id} className="-ms-2 size-7 rounded-full" /> : null}
            <span className="truncate">{title}</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
