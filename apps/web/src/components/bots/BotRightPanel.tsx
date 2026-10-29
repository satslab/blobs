import { BotResourcesPanel } from "./BotResourcesPanel";
import { useState } from "react";
import type { BotIdentity, ScopedThreadRef } from "@satslab/contracts";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowUpRightIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { usePreviewPanelInlineSize } from "../../hooks/usePreviewPanelInlineSize";
import { cn } from "../../lib/utils";
import { useBotThreadContext, useBots } from "../../state/bots";
import { RightPanelSheet } from "../RightPanelSheet";
import { PreviewPanelShell } from "../preview/PreviewPanelShell";
import { SettingsScopeProvider } from "../settings/SettingsScopeContext";
import { useScopedSettings } from "../settings/useScopedSettings";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { BotActionsProvider, useBotActions, useBotMenuDisabled } from "./BotActions";
import { BotAvatar } from "./BotAvatar";
import { BotIntegrationPanel } from "./BotIntegrationPanel";
import { BotMemoryPanel } from "./BotMemoryPanel";
import { PanelEmpty, PanelSection } from "./BotPanelParts";
import { BotRoleField } from "./BotResourceSettings";
import { BotWorkTab } from "./BotWorkTab";
import { useBotSettingsGroup } from "./useBotSettingsGroup";

const BOT_PANEL_DEFAULT_WIDTH = 360;

const TABS = [
  { value: "work", label: "Work" },
  { value: "autonomy", label: "Autonomy" },
  { value: "memory", label: "Memory" },
  { value: "connections", label: "Connections" },
  { value: "bot", label: "Bot" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export function BotRightPanel(props: {
  threadRef: ScopedThreadRef;
  open: boolean;
  sheet: boolean;
  animationDurationMs: number;
  workspaceLayoutElement: HTMLElement | null;
  widthStorageKey: string;
  onClose: () => void;
}) {
  const inlineSize = usePreviewPanelInlineSize({
    enabled: !props.sheet,
    container: props.workspaceLayoutElement,
    widthStorageKey: props.widthStorageKey,
    defaultWidth: BOT_PANEL_DEFAULT_WIDTH,
  });
  const panel = (
    <PreviewPanelShell
      mode={props.sheet ? "sheet" : "inline"}
      open={props.open}
      inlineSize={inlineSize}
    >
      <BotPanelContent threadRef={props.threadRef} onClose={props.onClose} />
    </PreviewPanelShell>
  );
  return props.sheet ? (
    <RightPanelSheet
      open={props.open}
      onClose={props.onClose}
      animationDurationMs={props.animationDurationMs}
    >
      {panel}
    </RightPanelSheet>
  ) : (
    panel
  );
}

function BotPanelContent({
  threadRef,
  onClose,
}: {
  threadRef: ScopedThreadRef;
  onClose: () => void;
}) {
  const context = useBotThreadContext(threadRef);
  const bot = useBots().find((candidate) => candidate.id === context?.botId) ?? null;
  const { group, connected } = useBotSettingsGroup(bot);
  const body = bot ? (
    <BotPanelBody
      // A transfer or reset gives the bot a new identity; start from the first tab again.
      key={`${bot.ownerEnvironmentId}:${bot.id}`}
      bot={bot}
      scoped={group !== null && connected}
      onClose={onClose}
    />
  ) : null;
  return (
    <BotActionsProvider>
      <section aria-label="Bot panel" data-bot-panel className="flex h-full min-h-0 flex-col">
        {bot && group ? (
          <SettingsScopeProvider
            search={{
              project: group.projectKey,
              machine: bot.ownerEnvironmentId,
              checkout: group.memberProjects[0]!.physicalProjectKey,
            }}
            onChange={() => undefined}
          >
            {body}
          </SettingsScopeProvider>
        ) : (
          body
        )}
      </section>
    </BotActionsProvider>
  );
}

function BotPanelBody({
  bot,
  scoped,
  onClose,
}: {
  bot: BotIdentity;
  scoped: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("work");
  return (
    <>
      <div className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2.5 px-3">
        <BotAvatar botId={bot.id} className="size-9 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm leading-tight font-semibold">{bot.name}</div>
          {scoped ? <BotRoleSummary /> : null}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close bot panel" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>
      <div
        role="tablist"
        aria-label="Bot panel tabs"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-3"
      >
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-2 py-3 text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              tab === item.value
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-4">
          <BotTab bot={bot} tab={tab} scoped={scoped} />
        </div>
      </ScrollArea>
    </>
  );
}

function BotTab({ bot, tab, scoped }: { bot: BotIdentity; tab: Tab; scoped: boolean }) {
  // Memory and connections belong to the bot's conversation, not to a subagent thread the panel may sit on.
  const rootRef = { environmentId: bot.ownerEnvironmentId, threadId: bot.threadId };
  switch (tab) {
    case "work":
      return (
        <>
          <BotWorkTab bot={bot} scoped={scoped} />
          <BotResourcesPanel bot={bot} section="work" />
        </>
      );
    case "autonomy":
      return <BotResourcesPanel bot={bot} section="autonomy" />;
    case "memory":
      return (
        <div className="px-4 pt-4">
          <BotMemoryPanel threadRef={rootRef} />
        </div>
      );
    case "connections":
      return (
        <div className="px-4 pt-4">
          <BotIntegrationPanel threadRef={rootRef} />
        </div>
      );
    case "bot":
      return <BotSettingsTab bot={bot} scoped={scoped} />;
  }
}

function BotRoleSummary() {
  const { botRole } = useScopedSettings();
  return botRole === "" ? null : (
    <div className="truncate text-xs text-muted-foreground">{botRole}</div>
  );
}

function BotSettingsTab({ bot, scoped }: { bot: BotIdentity; scoped: boolean }) {
  const actions = useBotActions();
  const location = useLocation();
  const unavailable = useBotMenuDisabled({
    ownerEnvironmentId: bot.ownerEnvironmentId,
    status: bot.status,
  });
  const disabled = unavailable || actions.busy !== null;
  return (
    <>
      <PanelSection
        title="Name"
        aside={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Rename bot"
            disabled={disabled}
            onClick={() => actions.open(bot, "rename")}
          >
            <PencilIcon className="size-3.5" />
          </Button>
        }
      >
        <p className="py-1.5 text-base">{bot.name}</p>
      </PanelSection>
      <PanelSection title="Role">
        {scoped ? (
          <fieldset disabled={disabled} className="contents">
            <BotRoleField />
          </fieldset>
        ) : (
          <PanelEmpty>Connect the owning environment to edit the role.</PanelEmpty>
        )}
        <p className="pt-2 text-xs text-muted-foreground">
          What this bot is for. It sees the role on every turn.
        </p>
      </PanelSection>
      <div className="px-4 pt-5">
        <Link
          to="/bots/settings/$environmentId/$botId"
          params={{ environmentId: bot.ownerEnvironmentId, botId: bot.id }}
          state={{ botSettingsReturnHref: location.href }}
          className="-mx-2 flex h-10 items-center gap-3 rounded-xl px-2 text-sm text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ArrowUpRightIcon className="size-4" />
          All bot settings
        </Link>
        <button
          type="button"
          disabled={disabled}
          onClick={() => actions.open(bot, "delete")}
          className="-mx-2 flex h-10 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 text-left text-sm text-destructive outline-hidden hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60"
        >
          <Trash2Icon className="size-4" />
          <span className="truncate">Delete {bot.name}</span>
        </button>
      </div>
    </>
  );
}
