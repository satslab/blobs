import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeProjectRef } from "@satslab/client-runtime/environment";
import { sourceControlClients } from "@satslab/client-runtime/source-control-clients";
import type { EnvironmentThreadShell } from "@satslab/client-runtime/state/shell";
import {
  AuthPreviewOperateScope,
  AuthTerminalOperateScope,
  type ScopedThreadRef,
  type ThreadId,
} from "@satslab/contracts";
import { projectScriptCwd, resolveProjectScripts } from "@satslab/shared/projectScripts";
import { resolveTerminalSessionLabel } from "@satslab/shared/terminalLabels";
import { visibleThreadPullRequests } from "@satslab/shared/threadPullRequests";
import {
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { previewRuntimeTabId } from "../../browser/previewRuntimeTabId";
import { useComposerDraftStore, type DraftId } from "../../composerDraftStore";
import type { ComposerHandleRef } from "../../composerHandleContext";
import { isElectron } from "../../env";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useRightPanelSurfaceClose } from "../../hooks/useRightPanelSurfaceClose";
import { useStableCallback } from "../../hooks/useStableCallback";
import { shortcutLabelForCommand, type ShortcutMatchContext } from "../../keybindings";
import { isEditableFocused } from "../../lib/editableFocus";
import { isPreviewFocused } from "../../lib/previewFocus";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import { getTerminalFocusOwner } from "../../lib/terminalFocus";
import { randomUUID } from "../../lib/utils";
import { usePanelAnimationSettings, usePanelPresence } from "../../panelAnimations";
import { isPreviewSupportedInRuntime, useThreadPreviewState } from "../../previewStateStore";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import {
  selectActiveRightPanel,
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "../../rightPanelStore";
import { useDeviceState } from "../../state/device";
import { useEnvironmentSupportsServerBrowser, useProject } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import {
  primaryServerAvailableEditorsAtom,
  primaryServerKeybindingsAtom,
} from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import {
  useKnownTerminalSessions,
  useThreadRunningTerminalIds,
} from "../../state/terminalSessions";
import { vcsEnvironment } from "../../state/vcs";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../../terminalUiStateStore";
import { recallCheckoutIsRepo } from "../ChatView.logic";
import { getConfiguredPreviewUrls } from "../preview/previewEmptyStateLogic";
import { usePreviewSession } from "../preview/usePreviewSession";
import { threadPullRequestPanelTarget } from "../pullRequest/pullRequestDetail.logic";
import { useThreadLinkedPullRequest } from "../pullRequest/useThreadLinkedPullRequest";
import { toastManager } from "../ui/toast";
import { ChatRightPanel } from "./ChatRightPanel";
import { RightPanelSurfaceContent } from "./RightPanelSurfaceContent";
import { type TerminalLaunchContext, useChatTerminalActions } from "./useChatTerminalActions";
import { useRightPanelActions } from "./useRightPanelActions";

const EMPTY_PENDING_FILE_SURFACE_IDS: ReadonlySet<string> = new Set();

type SurfaceContentProps = ComponentProps<typeof RightPanelSurfaceContent>;

/** What only a mounted chat can give the panel; without it the panel works on its own. */
export interface ThreadRightPanelChatHost {
  readonly composerRef: ComposerHandleRef;
  readonly composerDraftTarget: ScopedThreadRef | DraftId;
  readonly onSendAnnotation: SurfaceContentProps["onSendAnnotation"];
  readonly sideChatParentPanel: SideChatParentPanel;
  readonly workspaceMutationId: string | null;
  readonly terminalLaunchContext: TerminalLaunchContext | null;
  readonly setTerminalLaunchContext: Dispatch<SetStateAction<TerminalLaunchContext | null>>;
  readonly setThreadError: (threadId: ThreadId | null, error: string | null) => void;
  readonly getShortcutContext: () => ShortcutMatchContext;
  readonly threadPanelPresentation: ThreadPanelPresentation;
  readonly onDiffPanelOpen: (() => void) | undefined;
  /** Read by the chat's diff layout effect to keep an explicitly chosen diff scope. */
  readonly explicitDiffOpenRef: { current: ScopedThreadRef | null };
  readonly onAddSideChat: (() => void) | undefined;
  readonly sideChatAvailable: boolean;
  readonly sideChatDisabledReason: string | null;
}

/**
 * A thread's right panel: browser, terminal, files, diff, pull request, and device tabs. The chat
 * view hosts it beside the conversation; the bots workspace shows it on its own page.
 */
export function ThreadRightPanel({
  threadRef,
  thread,
  isServerThread,
  isBotThread,
  open: forcedOpen,
  sheet,
  maximized,
  workspaceLayoutElement,
  onCloseSheet,
  layoutControls,
  tabLook,
  chat,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly thread: EnvironmentThreadShell;
  readonly isServerThread: boolean;
  readonly isBotThread: boolean;
  /** Shows the panel regardless of the stored open flag, for hosts that are only the panel. */
  readonly open?: boolean;
  readonly sheet: boolean;
  readonly maximized: boolean;
  readonly workspaceLayoutElement: HTMLElement | null;
  readonly onCloseSheet: () => void;
  readonly layoutControls: ReactNode;
  readonly tabLook?: "track" | "folder";
  readonly chat?: ThreadRightPanelChatHost;
}) {
  const threadKey = scopedThreadKey(threadRef);
  const environmentId = thread.environmentId;
  const settings = useEnvironmentSettings(environmentId);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const availableEditors = useAtomValue(primaryServerAvailableEditorsAtom);
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const canOperatePreview = useEnvironmentScope(environmentId, AuthPreviewOperateScope);
  const serverConfig =
    useEnvironments().environments.find((item) => item.environmentId === environmentId)
      ?.serverConfig ?? null;
  const supportsPullRequests = serverConfig !== null;
  const serverBrowser = useEnvironmentSupportsServerBrowser(environmentId);
  const browserAvailable = isPreviewSupportedInRuntime() || serverBrowser;

  // Standalone fallbacks for what a chat would otherwise own.
  const standaloneComposerRef = useRef(null);
  const [standaloneLaunchContext, setStandaloneLaunchContext] =
    useState<TerminalLaunchContext | null>(null);
  const terminalLaunchContextState = chat?.terminalLaunchContext ?? standaloneLaunchContext;
  const setTerminalLaunchContext = chat?.setTerminalLaunchContext ?? setStandaloneLaunchContext;
  const setThreadError =
    chat?.setThreadError ??
    ((_threadId: ThreadId | null, error: string | null) => {
      if (error) toastManager.add({ type: "error", title: error });
    });

  const project = useProject(scopeProjectRef(environmentId, thread.projectId));
  const projectScripts = project ? resolveProjectScripts(settings, project) : [];
  const configuredPreviewUrls = getConfiguredPreviewUrls(projectScripts);
  const gitCwd = project
    ? projectScriptCwd({
        project: { cwd: project.workspaceRoot },
        worktreePath: thread.worktreePath,
      })
    : null;
  const projectCwd = project?.workspaceRoot ?? null;
  const workspaceRoot = thread.worktreePath ?? projectCwd ?? undefined;
  const gitStatusCwd = thread.worktreePath ?? gitCwd;
  const gitStatusQuery = useEnvironmentQuery(
    gitStatusCwd === null
      ? null
      : vcsEnvironment.status({ environmentId, input: { cwd: gitStatusCwd } }),
  );
  const isGitRepo =
    gitStatusQuery.data?.isRepo ?? recallCheckoutIsRepo(environmentId, gitStatusCwd) ?? true;

  const panelState = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, threadRef),
  );
  const activeSurface = useRightPanelStore((state) =>
    selectActiveRightPanelSurface(state.byThreadKey, threadRef),
  );
  const activeKind = useRightPanelStore((state) =>
    selectActiveRightPanel(state.byThreadKey, threadRef),
  );
  const open = forcedOpen ?? panelState.isOpen;
  const { active: animated, durationMs } = usePanelAnimationSettings();
  const presence = usePanelPresence(
    open,
    { activeSurface, surfaces: panelState.surfaces },
    animated,
    threadKey,
    durationMs,
  );
  const renderedSurface = presence.value?.activeSurface ?? null;
  const renderedSurfaces = presence.value?.surfaces ?? [];

  const previewState = useThreadPreviewState(threadRef);
  const previewServerEpoch = previewState.serverEpoch;
  const resolvePreviewRuntimeTabId = (tabId: string) =>
    previewRuntimeTabId(threadRef, previewServerEpoch, tabId);
  const { state: deviceState, loaded: deviceStateLoaded } = useDeviceState(environmentId);

  const terminalUiState = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef),
  );
  const runningTerminalIds = useThreadRunningTerminalIds({ environmentId, threadId: thread.id });
  const knownSessionsRaw = useKnownTerminalSessions({ environmentId, threadId: thread.id });
  const knownSessions = (knownSessionsRaw ?? []).filter(
    (session) => session.target.threadId === thread.id,
  );
  const terminalLabelsById = new Map(
    knownSessions.map((session) => [
      session.target.terminalId,
      resolveTerminalSessionLabel(session.target.terminalId, session.state.summary),
    ]),
  );
  const panelTerminalIds = new Set(
    panelState.surfaces.flatMap((surface) =>
      surface.kind === "terminal" ? surface.terminalIds : [],
    ),
  );
  const terminalLaunchContext =
    terminalLaunchContextState?.threadId === thread.id ? terminalLaunchContextState : null;

  const visiblePullRequests = visibleThreadPullRequests(thread.pullRequests);
  const pullRequestsSurfaceAvailable =
    isServerThread && supportsPullRequests && visiblePullRequests.length > 0;
  const { linked: linkedPullRequest } = useThreadLinkedPullRequest({
    serverThreadRef: isServerThread ? threadRef : null,
    environmentId,
    persisted: thread.linkedPullRequest ?? null,
    projectId: project?.id ?? null,
    projectRepository: sourceControlClients.repositorySelector(project?.repositoryIdentity),
    threadBranch: thread.branch,
    gitStatus: gitStatusQuery.data ?? null,
  });
  const branchPullRequest = thread.branchPullRequest ?? null;
  const pullRequestPanelTarget = threadPullRequestPanelTarget({
    projectId: thread.projectId,
    pullRequests: visiblePullRequests,
    linkedPullRequest,
    branchPullRequest,
  });

  const { closeSurface, closeOtherSurfaces, closeSurfacesToRight, closeAllSurfaces } =
    useRightPanelSurfaceClose({ threadRef, terminalLabelsById });

  const {
    activatePanelTerminalStable,
    addTerminalContextToDraftStable,
    addTerminalSurfaceStable,
    closePanelTerminalStable,
    splitPanelTerminalStable,
    splitPanelTerminalVerticalStable,
  } = useChatTerminalActions({
    isBotThread,
    environmentId,
    composerRef: chat?.composerRef ?? standaloneComposerRef,
    terminalUiState,
    activeThread: thread,
    activeThreadId: thread.id,
    activeThreadRef: threadRef,
    activeProject: project,
    activeRightPanelSurface: activeSurface,
    runningTerminalIds,
    activeServerOrderedTerminalIds: knownSessions.map((session) => session.target.terminalId),
    activeTerminalLabelsById: terminalLabelsById,
    panelTerminalIds,
    canReuseTerminal: knownSessionsRaw !== null,
    gitCwd,
    setTerminalUiLaunchContext: setTerminalLaunchContext,
    setThreadError,
  });
  // Without a chat composer, terminal context lands in the thread's saved draft.
  const addTerminalContextStable = useStableCallback(
    (selection: Parameters<typeof addTerminalContextToDraftStable>[0]) => {
      if (chat) return addTerminalContextToDraftStable(selection);
      useComposerDraftStore.getState().addTerminalContexts(threadRef, [
        {
          id: randomUUID(),
          threadId: thread.id,
          createdAt: new Date().toISOString(),
          ...selection,
        },
      ]);
      toastManager.add({ type: "success", title: `Added to ${thread.title}'s message` });
    },
  );

  const standaloneExplicitDiffOpenRef = useRef<ScopedThreadRef | null>(null);
  const {
    activateRightPanelSurfaceStable,
    addDeviceSurfaceStable,
    addDiffSurfaceStable,
    addFilesSurfaceStable,
    addPullRequestSurfaceStable,
    addPullRequestsSurfaceStable,
    copyRightPanelFilePathStable,
    createBrowserSurface,
    createBrowserSurfaceStable,
    moveRightPanelSurfaceStable,
    openFileSurfaceStable,
  } = useRightPanelActions({
    activeThreadRef: threadRef,
    activeProject: project,
    activeRightPanelSurface: activeSurface,
    activePreviewState: previewState,
    deviceState,
    deviceStateLoaded,
    pullRequestPanelTarget,
    threadPanelPresentation: chat?.threadPanelPresentation ?? "inline",
    isBotThread,
    isServerThread,
    // The chat view (or nothing, standalone) owns the preview bus subscription.
    embedded: true,
    isGitRepo,
    browserAvailable,
    canOperatePreview,
    diffOpen: activeKind === "diff",
    previewPanelOpen: activeKind === "preview" && browserAvailable,
    rightPanelOpen: open,
    canMaximizeRightPanel: open,
    rightPanelMaximized: maximized,
    supportsPullRequests,
    pullRequestsSurfaceAvailable,
    gitCwd,
    activeProjectCwd: projectCwd,
    explicitDiffOpenRef: chat?.explicitDiffOpenRef ?? standaloneExplicitDiffOpenRef,
    onDiffPanelOpen: chat?.onDiffPanelOpen,
    closeRightPanelSurface: closeSurface,
  });

  // Files being opened, so their tabs show a pending state; kept per project checkout.
  const projectKey = project ? `${project.environmentId}:${project.workspaceRoot}` : null;
  const [pendingFilesByProject, setPendingFilesByProject] = useState<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => new Map());
  const pendingFileSurfaceIds = projectKey
    ? (pendingFilesByProject.get(projectKey) ?? EMPTY_PENDING_FILE_SURFACE_IDS)
    : EMPTY_PENDING_FILE_SURFACE_IDS;
  const handleFilePendingChangeStable = useStableCallback(
    (relativePath: string, pending: boolean) => {
      if (!projectKey) return;
      setPendingFilesByProject((currentByProject) => {
        const current = currentByProject.get(projectKey) ?? EMPTY_PENDING_FILE_SURFACE_IDS;
        const surfaceId = `file:${relativePath}`;
        if (current.has(surfaceId) === pending) return currentByProject;
        const next = new Set(current);
        if (pending) next.add(surfaceId);
        else next.delete(surfaceId);
        const nextByProject = new Map(currentByProject);
        if (next.size === 0) nextByProject.delete(projectKey);
        else nextByProject.set(projectKey, next);
        return nextByProject;
      });
    },
  );

  const terminalShortcutLabelOptions = {
    context: { terminalFocus: true, terminalOpen: Boolean(terminalUiState.terminalOpen) },
  };
  const terminalShortcutLabel = (command: Parameters<typeof shortcutLabelForCommand>[1]) =>
    shortcutLabelForCommand(keybindings, command, terminalShortcutLabelOptions) ?? undefined;

  const getShortcutContextStable = useStableCallback(
    chat?.getShortcutContext ??
      ((): ShortcutMatchContext => ({
        terminalFocus: getTerminalFocusOwner() !== null,
        terminalOpen: Boolean(terminalUiState.terminalOpen),
        previewFocus: isPreviewFocused(),
        previewOpen: activeKind === "preview" && browserAvailable,
        editableFocus: isEditableFocused(document.activeElement),
        modelPickerOpen: false,
        composerFocus: false,
        draftThreadRoute: false,
        turnRunning: false,
        composerRequiresModifier: false,
        isWeb: !isElectron,
        isDesktop: isElectron,
      })),
  );
  const sendAnnotationStable = useStableCallback(
    (...args: Parameters<SurfaceContentProps["onSendAnnotation"]>) => {
      if (chat) return chat.onSendAnnotation(...args);
      toastManager.add({
        type: "info",
        title: "Annotations send from the chat",
        description: "Switch to the chat to send this annotation.",
      });
    },
  );
  const standaloneSideChatParent = {
    openToolDiff: () => undefined,
    runShellCommand: () => undefined,
  };

  return (
    <>
      {/* The chat syncs server browser sessions; on its own the panel does. */}
      {!chat && canOperatePreview && serverBrowser ? (
        <PreviewSessionSync threadRef={threadRef} />
      ) : null}
      <ChatRightPanel
        sheet={sheet}
        workspaceLayoutElement={workspaceLayoutElement}
        widthStorageKey={`blobs:preview-panel-width:${threadKey}`}
        sheetAnimationDurationMs={animated ? durationMs : 0}
        onCloseSheet={onCloseSheet}
        open={open}
        keybindings={keybindings}
        getShortcutContext={getShortcutContextStable}
        maximized={maximized}
        layoutControls={layoutControls}
        {...(tabLook ? { tabLook } : {})}
        surfaces={renderedSurfaces}
        environmentId={environmentId}
        activeSurfaceId={renderedSurface?.id ?? null}
        pendingSurfaceIds={pendingFileSurfaceIds}
        previewSessions={previewState.sessions}
        desktopByTabId={previewState.desktopByTabId}
        previewRuntimeTabId={resolvePreviewRuntimeTabId}
        terminalLabelsById={terminalLabelsById}
        onActivate={activateRightPanelSurfaceStable}
        onCloseSurface={closeSurface}
        onRenameDevice={(surfaceId, title) =>
          useRightPanelStore.getState().renameDevice(threadRef, surfaceId, title)
        }
        onCloseOtherSurfaces={closeOtherSurfaces}
        onCloseSurfacesToRight={closeSurfacesToRight}
        onCloseAllSurfaces={closeAllSurfaces}
        onMoveSurface={moveRightPanelSurfaceStable}
        onCopyFilePath={copyRightPanelFilePathStable}
        onAddBrowser={() => createBrowserSurface()}
        onAddBrowserInProfile={createBrowserSurfaceStable}
        onAddTerminal={addTerminalSurfaceStable}
        onAddDiff={addDiffSurfaceStable}
        onAddFiles={addFilesSurfaceStable}
        onAddPullRequest={addPullRequestSurfaceStable}
        onAddPullRequests={addPullRequestsSurfaceStable}
        onAddDevice={addDeviceSurfaceStable}
        onAddSideChat={chat?.onAddSideChat}
        browserAvailable={canOperatePreview && browserAvailable}
        terminalAvailable={project !== null && canOperateTerminal}
        diffAvailable={isServerThread && isGitRepo}
        filesAvailable={project !== null}
        pullRequestAvailable={supportsPullRequests && pullRequestPanelTarget !== null}
        pullRequestsAvailable={pullRequestsSurfaceAvailable}
        deviceAvailable
        sideChatAvailable={chat?.sideChatAvailable ?? false}
        sideChatDisabledReason={chat?.sideChatDisabledReason ?? null}
      >
        <RightPanelSurfaceContent
          surface={renderedSurface}
          activeSurfaceId={activeSurface?.id ?? null}
          threadRef={threadRef}
          environmentId={environmentId}
          visible={open}
          composerDraftTarget={chat?.composerDraftTarget ?? threadRef}
          keybindings={keybindings}
          configuredPreviewUrls={configuredPreviewUrls}
          workspaceMutationId={chat?.workspaceMutationId ?? null}
          getShortcutContext={getShortcutContextStable}
          onSendAnnotation={sendAnnotationStable}
          onCloseSurface={closeSurface}
          sideChatParentPanel={chat?.sideChatParentPanel ?? standaloneSideChatParent}
          terminal={{
            launchContext: terminalLaunchContext,
            keybindings,
            onAddTerminalContext: addTerminalContextStable,
            onSplitTerminal: splitPanelTerminalStable,
            onSplitTerminalVertical: splitPanelTerminalVerticalStable,
            onNewTerminal: addTerminalSurfaceStable,
            onActiveTerminalChange: activatePanelTerminalStable,
            onCloseTerminal: closePanelTerminalStable,
            splitShortcutLabel: terminalShortcutLabel("terminal.split"),
            splitVerticalShortcutLabel: terminalShortcutLabel("terminal.splitVertical"),
            newShortcutLabel: terminalShortcutLabel("terminal.new"),
            closeShortcutLabel: terminalShortcutLabel("terminal.close"),
          }}
          pullRequest={{
            capabilityKnown: serverConfig !== null,
            supported: supportsPullRequests,
            projectId: thread.projectId,
            pullRequests: visiblePullRequests,
            linkedPullRequest,
            branchPullRequest,
            onBack:
              pullRequestsSurfaceAvailable && visiblePullRequests.length > 1
                ? addPullRequestsSurfaceStable
                : undefined,
          }}
          files={{
            projectId: project?.id,
            projectName: project?.title ?? null,
            workspaceRoot,
            availableEditors,
            pendingSurfaceIds: pendingFileSurfaceIds,
            onOpenFile: openFileSurfaceStable,
            onPendingChange: handleFilePendingChangeStable,
          }}
        />
      </ChatRightPanel>
    </>
  );
}

function PreviewSessionSync(props: { readonly threadRef: ScopedThreadRef }) {
  usePreviewSession(props.threadRef);
  return null;
}
