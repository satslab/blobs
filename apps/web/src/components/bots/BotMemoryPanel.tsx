import { useId, useState, type ReactNode } from "react";
import type {
  BotId,
  BotMemoryResult,
  BotMemoryView,
  EnvironmentId,
  ScopedThreadRef,
} from "@satslab/contracts";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useBotThreadContext } from "../../state/bots";
import { botMemory } from "../../state/botMemory";
import { useEnvironmentQuery } from "../../state/query";
import { cn } from "../../lib/utils";
import { ThreadDetailsSection } from "../chat/ThreadDetailsSection";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { Toggle, ToggleGroup } from "../ui/toggle-group";

type Tab = "entries" | "snapshots";
type Stats = BotMemoryResult["stats"];

const kindLabels = { user: "Incoming", talk: "Reply", tool: "Tool call", echo: "Tool result" };
const viewLabels = { turn: "Turn view", compaction: "Compactor view" };

// Memory budgets are decimal, so this card counts 1 KB as 1,000 bytes.
function formatMemoryBytes(value: number) {
  if (value < 1_000) return `${value} B`;
  const [size, unit] = value < 1_000_000 ? [value / 1_000, "KB"] : [value / 1_000_000, "MB"];
  return `${size.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("entries");
  const listId = useId();
  const summary = useEnvironmentQuery(
    botMemory({ environmentId, input: { botId, section: "summary" } }),
  );
  const details = useEnvironmentQuery(
    open ? botMemory({ environmentId, input: { botId, section: tab } }) : null,
  );
  const stats = summary.data?.stats;
  const pending = summary.isPending || details.isPending;
  const total = stats ? (tab === "entries" ? stats.entries : stats.snapshots) : 0;
  const shown = tab === "entries" ? details.data?.entries.length : details.data?.snapshots.length;

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
          disabled={pending}
          onClick={() => {
            summary.refresh();
            if (open) details.refresh();
          }}
        >
          <RefreshIcon size="xs" />
        </Button>
      }
    >
      {summary.error ? (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {summary.error}
        </p>
      ) : null}
      {!stats ? (
        summary.error ? null : (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">Loading memory…</p>
        )
      ) : stats.entries === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">Nothing remembered yet</p>
      ) : (
        <>
          <MemoryStats stats={stats} views={summary.data?.views ?? []} />
          {open ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-2.5 py-2">
                <ToggleGroup
                  aria-label="Memory view"
                  variant="segmented"
                  value={[tab]}
                  onValueChange={(next) => {
                    const value = next[0];
                    if (value === "entries" || value === "snapshots") setTab(value);
                  }}
                >
                  <Toggle value="entries">Entries</Toggle>
                  <Toggle value="snapshots">Snapshots</Toggle>
                </ToggleGroup>
                {shown !== undefined ? (
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {shown.toLocaleString()} of {total.toLocaleString()} · newest first
                  </span>
                ) : null}
              </div>
              {details.error ? (
                <p
                  role="alert"
                  className="border-t border-border/50 px-3 py-2 text-xs text-destructive"
                >
                  {details.error}
                </p>
              ) : null}
              <div
                id={listId}
                role="region"
                aria-label={tab === "entries" ? "Recent memory entries" : "Frozen memory snapshots"}
                className="border-t border-border/50"
              >
                <MemoryList data={details.data} tab={tab} />
              </div>
            </>
          ) : null}
          <button
            type="button"
            aria-label={open ? "Hide memory entries" : "Show memory entries"}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => setOpen((value) => !value)}
            className="flex h-8 w-full items-center justify-center border-t border-border/50 text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ChevronDownIcon
              aria-hidden
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
        </>
      )}
    </ThreadDetailsSection>
  );
}

function MemoryStats({ stats, views }: { stats: Stats; views: readonly BotMemoryView[] }) {
  const jobs = stats.queuedJobs + stats.runningJobs + stats.failedJobs;
  const compaction =
    stats.failedJobs > 0
      ? "Needs attention"
      : stats.runningJobs > 0
        ? "Summarizing"
        : stats.queuedJobs > 0 || stats.pending
          ? "Pending"
          : "Ready";
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-4 gap-y-3 px-3 py-3">
      <Stat label="Entries" value={stats.entries.toLocaleString()}>
        {formatMemoryBytes(stats.originalBytes)}
      </Stat>
      {views.map((view) => (
        <Stat
          key={view.name}
          label={viewLabels[view.name]}
          value={
            view.bytes === null ? (
              "Not ready"
            ) : (
              <>
                {formatMemoryBytes(view.bytes)}
                <span className="ms-1 text-2xs font-normal text-muted-foreground">
                  of {formatMemoryBytes(view.highBytes)}
                </span>
              </>
            )
          }
          meter={view.bytes === null ? undefined : <ViewMeter view={view} bytes={view.bytes} />}
        />
      ))}
      <Stat label="Summaries" value={stats.summaries.toLocaleString()} />
      <Stat label="Snapshots" value={stats.snapshots.toLocaleString()} />
      <Stat
        label="Compaction"
        value={<span role="status">{compaction}</span>}
        tone={stats.failedJobs > 0 ? "destructive" : "default"}
      >
        {jobs > 0
          ? `${stats.queuedJobs} queued · ${stats.runningJobs} running · ${stats.failedJobs} failed`
          : null}
      </Stat>
    </dl>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  meter,
  children,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "destructive";
  meter?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="truncate text-2xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate text-sm font-semibold tabular-nums",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </dd>
      {children ? (
        <dd className="truncate text-2xs text-muted-foreground tabular-nums">{children}</dd>
      ) : null}
      {meter ? <dd className="mt-1.5">{meter}</dd> : null}
    </div>
  );
}

/** Size against the view's upper limit; the notch marks the low-water mark compaction shrinks to. */
function ViewMeter({ view, bytes }: { view: BotMemoryView; bytes: number }) {
  const percent = (value: number) => Math.min(100, (value / view.highBytes) * 100);
  return (
    <div
      role="meter"
      aria-label={`${viewLabels[view.name]} size`}
      aria-valuemin={0}
      aria-valuemax={view.highBytes}
      aria-valuenow={Math.min(bytes, view.highBytes)}
      aria-valuetext={`${formatMemoryBytes(bytes)} of ${formatMemoryBytes(view.highBytes)}`}
      className="relative h-1 overflow-hidden rounded-full bg-muted"
    >
      <span
        className="absolute inset-y-0 start-0 rounded-full bg-primary/55"
        style={{ width: `${percent(bytes)}%` }}
      />
      <span
        className="absolute inset-y-0 w-px bg-background"
        style={{ insetInlineStart: `${percent(view.lowBytes)}%` }}
      />
    </div>
  );
}

function MemoryList({ data, tab }: { data: BotMemoryResult | null; tab: Tab }) {
  if (!data) return <p className="px-3 py-2.5 text-xs text-muted-foreground">Loading…</p>;
  const empty = tab === "entries" ? data.entries.length === 0 : data.snapshots.length === 0;
  if (empty)
    return (
      <p className="px-3 py-2.5 text-xs text-muted-foreground">
        {tab === "entries" ? "No entries" : "No snapshots"}
      </p>
    );
  return (
    <ul key={tab} className="max-h-72 overflow-y-auto overscroll-contain">
      {tab === "entries"
        ? data.entries.map((entry) => (
            <MemoryRow
              key={entry.id}
              label={kindLabels[entry.kind]}
              meta={entry.date.slice(0, 16).replace("T", " ")}
              text={entry.text}
              truncated={entry.truncated}
            />
          ))
        : data.snapshots.map((snapshot) => (
            <MemoryRow
              key={snapshot.runId}
              label="Snapshot"
              meta={`${snapshot.total.toLocaleString()} entries`}
              text={snapshot.view}
              truncated={snapshot.truncated}
              mono
            />
          ))}
    </ul>
  );
}

/** One memory item: a clamped preview that opens into its full stored text. */
function MemoryRow({
  label,
  meta,
  text,
  truncated,
  mono = false,
}: {
  label: string;
  meta: string;
  text: string;
  truncated: boolean;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-border/50 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="block w-full px-3 py-2 text-left text-xs outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <Badge variant="secondary" size="sm">
            {label}
          </Badge>
          <span className="ml-auto truncate text-2xs text-muted-foreground tabular-nums">
            {meta}
          </span>
        </span>
        {open ? null : (
          <span className="mt-1 line-clamp-2 block ps-5 text-pretty text-foreground [overflow-wrap:anywhere]">
            {text}
          </span>
        )}
      </button>
      {open ? (
        <div className="px-3 pb-2.5 ps-8 text-xs">
          <pre
            tabIndex={0}
            className={cn(
              "m-0 max-h-64 overflow-auto rounded-lg bg-muted/40 px-2.5 py-2 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              mono ? "font-mono" : "font-sans",
            )}
          >
            {text}
          </pre>
          {truncated ? <p className="mt-1 text-muted-foreground">Truncated preview</p> : null}
        </div>
      ) : null}
    </li>
  );
}
