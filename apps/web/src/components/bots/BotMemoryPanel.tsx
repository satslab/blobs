import { useState } from "react";
import type { BotId, BotMemoryInput, EnvironmentId, ScopedThreadRef } from "@satslab/contracts";
import { useBotThreadContext } from "../../state/bots";
import { botMemory } from "../../state/botMemory";
import { useEnvironmentQuery } from "../../state/query";
import { formatBytes } from "../../lib/formatBytes";
import { ThreadDetailsSection } from "../chat/ThreadDetailsSection";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";

const kindLabels = { user: "Incoming", talk: "Reply", tool: "Tool call", echo: "Tool result" };

export function BotMemoryPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const bot = useBotThreadContext(threadRef);
  return bot ? (
    <BotMemoryContent
      key={`${threadRef.environmentId}:${bot.botId}`}
      environmentId={threadRef.environmentId}
      botId={bot.botId}
    />
  ) : null;
}

function BotMemoryContent({
  environmentId,
  botId,
}: {
  environmentId: EnvironmentId;
  botId: BotId;
}) {
  const [section, setSection] = useState<BotMemoryInput["section"]>("summary");
  const summary = useEnvironmentQuery(
    botMemory({ environmentId, input: { botId, section: "summary" } }),
  );
  const details = useEnvironmentQuery(
    section === "summary" ? null : botMemory({ environmentId, input: { botId, section } }),
  );
  const query = section === "summary" ? summary : details;
  const data = query.data;
  const entries = data?.entries ?? [];
  const snapshots = data?.snapshots ?? [];
  const stats = summary.data?.stats;
  const compaction = !stats
    ? null
    : stats.failedJobs > 0
      ? "Needs attention"
      : stats.runningJobs > 0
        ? "Summarizing"
        : stats.queuedJobs > 0 || stats.pending
          ? "Pending"
          : "Ready";
  return (
    <ThreadDetailsSection
      headingId="bot-memory-heading"
      title="Memory"
      variant="card"
      padded={false}
      actions={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh bot memory"
          disabled={query.isPending}
          onClick={query.refresh}
        >
          <RefreshIcon size="xs" />
        </Button>
      }
    >
      {query.error ? (
        <p role="alert" className="px-2.5 py-2 text-xs text-destructive">
          {query.error}
        </p>
      ) : null}
      {!stats && !query.error ? (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">Loading memory…</p>
      ) : null}
      {stats ? (
        <>
          <dl className="grid grid-cols-4 py-3 text-xs">
            {[
              ["Entries", stats.entries.toLocaleString()],
              ["Summaries", stats.summaries.toLocaleString()],
              ["Snapshots", stats.snapshots.toLocaleString()],
              ["Original text", formatBytes(stats.originalBytes)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex min-w-0 flex-col-reverse border-l border-border/50 px-2.5 first:border-l-0"
              >
                <dt className="mt-0.5 truncate text-2xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-base font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex min-h-10 items-center justify-between gap-2 border-t border-border/50 px-3 text-xs">
            <span className="text-muted-foreground">Compaction</span>
            <span role="status">{compaction}</span>
          </div>
          {stats.queuedJobs + stats.runningJobs + stats.failedJobs > 0 ? (
            <p className="px-2.5 pb-2 text-xs text-muted-foreground">
              {stats.queuedJobs} queued · {stats.runningJobs} running · {stats.failedJobs} failed
            </p>
          ) : null}
          <div className="border-t border-border/50">
            <CollapsibleSectionHeader
              variant="card"
              expanded={section === "entries"}
              onClick={() => setSection(section === "entries" ? "summary" : "entries")}
            >
              Recent entries
            </CollapsibleSectionHeader>
            {section === "entries" ? (
              <div
                role="region"
                aria-label="Recent memory entries"
                tabIndex={0}
                className="max-h-56 overflow-y-auto overscroll-contain px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {query.isPending && !data ? (
                  <p className="py-2 text-muted-foreground">Loading entries…</p>
                ) : entries.length === 0 ? (
                  <p className="py-2 text-muted-foreground">No entries</p>
                ) : (
                  entries.map((entry) => (
                    <details
                      key={entry.id}
                      className="border-b border-border/50 py-2 last:border-0"
                    >
                      <summary className="cursor-pointer text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {kindLabels[entry.kind]}
                        </span>{" "}
                        · {entry.date.slice(0, 16).replace("T", " ")}
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">
                        {entry.text}
                      </pre>
                      {entry.truncated ? (
                        <p className="mt-1 text-muted-foreground">Truncated preview</p>
                      ) : null}
                    </details>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <div className="border-t border-border/50">
            <CollapsibleSectionHeader
              variant="card"
              expanded={section === "snapshots"}
              onClick={() => setSection(section === "snapshots" ? "summary" : "snapshots")}
            >
              Frozen snapshots
            </CollapsibleSectionHeader>
            {section === "snapshots" ? (
              <div
                role="region"
                aria-label="Frozen memory snapshots"
                tabIndex={0}
                className="max-h-56 overflow-y-auto overscroll-contain px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {query.isPending && !data ? (
                  <p className="py-2 text-muted-foreground">Loading snapshots…</p>
                ) : snapshots.length === 0 ? (
                  <p className="py-2 text-muted-foreground">No snapshots</p>
                ) : (
                  snapshots.map((snapshot, index) => (
                    <details
                      key={snapshot.runId}
                      className="border-b border-border/50 py-2 last:border-0"
                    >
                      <summary className="cursor-pointer text-muted-foreground">
                        <span className="font-medium text-foreground">Snapshot {index + 1}</span> ·{" "}
                        {snapshot.total.toLocaleString()} entries
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono">
                        {snapshot.view}
                      </pre>
                      {snapshot.truncated ? (
                        <p className="mt-1 text-muted-foreground">Truncated preview</p>
                      ) : null}
                    </details>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </ThreadDetailsSection>
  );
}
