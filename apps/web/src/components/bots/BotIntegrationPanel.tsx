import type { BotIdentity, ScopedThreadRef } from "@satslab/contracts";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowUpRightIcon, CircleAlertIcon } from "lucide-react";
import { useBotThreadContext, useBots } from "../../state/bots";
import { botDiscordStatus } from "../../state/botDiscord";
import { useEnvironmentQuery } from "../../state/query";
import { cn } from "../../lib/utils";
import { ThreadDetailsSection } from "../chat/ThreadDetailsSection";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { discordPanelStatus, discordUserPolicyLabel } from "./BotIntegrationPanel.logic";

export function BotIntegrationPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const context = useBotThreadContext(threadRef);
  const bot = useBots().find((candidate) => candidate.id === context?.botId);
  return bot ? (
    <DiscordIntegrationCard key={`${bot.ownerEnvironmentId}:${bot.id}`} bot={bot} />
  ) : null;
}

function DiscordIntegrationCard({ bot }: { bot: BotIdentity }) {
  const location = useLocation();
  const query = useEnvironmentQuery(
    botDiscordStatus({ environmentId: bot.ownerEnvironmentId, input: { botId: bot.id } }),
  );
  const status = query.data;
  const label = status ? discordPanelStatus(status) : query.error ? "Unavailable" : "Loading…";
  const enabled = status?.settings.enabled === true;
  const connected = enabled && status?.connection === "connected" && status.credentialConfigured;
  const failed = enabled && status?.connection === "error";
  const settingsLink = (
    <Link
      to="/bots/settings/$environmentId/$botId"
      params={{ environmentId: bot.ownerEnvironmentId, botId: bot.id }}
      hash="bot-discord"
      state={{ botSettingsReturnHref: location.href }}
    />
  );
  const error = query.error ?? (enabled ? status?.error : null);
  return (
    <ThreadDetailsSection
      headingId="bot-panel-integration-heading"
      title="Integration"
      variant="card"
      padded={false}
    >
      <div className="@container">
        <div className="flex min-h-16 items-center gap-3 px-3 py-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              enabled ? "bg-discord text-white" : "bg-muted text-muted-foreground",
            )}
          >
            <DiscordGlyph />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">Discord</div>
            <div
              role="status"
              className={cn(
                "mt-0.5 flex items-center gap-1.5 text-2xs",
                connected
                  ? "text-success"
                  : failed
                    ? "text-destructive"
                    : status?.connection === "connecting"
                      ? "text-info"
                      : "text-muted-foreground",
              )}
            >
              {connected ? (
                <span className="size-1.5 rounded-full bg-success" />
              ) : failed ? (
                <CircleAlertIcon className="size-3" />
              ) : null}
              {label}
            </div>
          </div>
          {enabled ? (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Refresh Discord status"
                disabled={query.isPending}
                onClick={query.refresh}
              >
                <RefreshIcon size="xs" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Open bot integration settings"
                render={settingsLink}
              >
                <ArrowUpRightIcon className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="xs"
              aria-label="Open Discord setup"
              render={settingsLink}
            >
              {status?.credentialConfigured ? "Configure" : "Set up"}
            </Button>
          )}
        </div>
        {error ? (
          <div className="border-t border-border/50 bg-destructive/5 px-3 py-2.5">
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="ghost" size="xs" disabled={query.isPending} onClick={query.refresh}>
                <RefreshIcon size="xs" />
                Refresh
              </Button>
              <Button variant="ghost-muted" size="xs" render={settingsLink}>
                Update token
              </Button>
            </div>
          </div>
        ) : null}
        {enabled && status ? (
          <dl
            className={cn(
              "grid gap-2 border-t border-border/50 px-3 py-2.5 text-xs @min-[340px]:grid-cols-3 @min-[340px]:gap-0",
              !connected && "text-muted-foreground",
            )}
          >
            {[
              [
                "Messages",
                status.settings.interactionMode === "mention-only"
                  ? "Mentions only"
                  : "All messages",
              ],
              ["Replies", status.settings.replyMode === "thread" ? "In thread" : "To message"],
              ["Users", discordUserPolicyLabel(status.settings.userPolicy)],
            ].map(([name, value]) => (
              <div
                key={name}
                className="flex justify-between gap-2 @min-[340px]:flex-col-reverse @min-[340px]:gap-1 @min-[340px]:border-l @min-[340px]:border-border/50 @min-[340px]:px-2 @min-[340px]:first:border-l-0 @min-[340px]:first:pl-0"
              >
                <dt className="text-2xs text-muted-foreground">{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}

function DiscordGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4.5" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
