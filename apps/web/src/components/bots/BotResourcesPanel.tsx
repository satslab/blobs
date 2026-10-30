import { useEffect, useId, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { BotCheckInSettings, BotIdentity, BotResourceAction } from "@satslab/contracts";
import { botResources, botResourcesChange, botCheckIn } from "../../state/botResources";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { EyeIcon, KeyRoundIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { PanelCard, PanelEmpty, PanelField, PanelGroup, PanelList } from "./BotPanelParts";
import { ActiveHoursField } from "./ActiveHoursField";

type CheckInSettings = typeof BotCheckInSettings.Type;

const EVERY_HOURS = [1, 2, 3, 4, 6, 8, 12, 24];
const MAX_PER_DAY = [1, 2, 3, 4, 5, 6, 8, 10, 12, 24, 50];
const TIMEZONES = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);

const withCurrent = (options: readonly number[], current: number) =>
  options.includes(current) ? options : [...options, current].toSorted((a, b) => a - b);

type BotResources = ReturnType<typeof useBotResources>;

/** A bot's database-backed follow-ups, skills, secrets and check-in settings, and the change that edits them. */
export function useBotResources(bot: BotIdentity) {
  const environmentId = bot.ownerEnvironmentId;
  const query = useEnvironmentQuery(botResources({ environmentId, input: { botId: bot.id } }));
  const change = useAtomCommand(botResourcesChange, { label: "bot resources" });
  const canChange = useAtomValue(botResourcesChange.permissionAtom(environmentId));
  const [busy, setBusy] = useState(false);
  async function save(action: BotResourceAction) {
    setBusy(true);
    const result = await change({ environmentId, input: { botId: bot.id, action } }).finally(() =>
      setBusy(false),
    );
    if (result._tag === "Success") query.refresh();
  }
  return {
    query,
    save,
    disabled: !canChange || busy || bot.status !== "active",
  };
}

type FollowUp = NonNullable<BotResources["query"]["data"]>["followUps"][number];

/** Follow-ups the bot is tracking; it adds them itself, the user resolves or dismisses them. */
export function BotFollowUps({
  items,
  resources,
}: {
  items: readonly FollowUp[];
  resources: BotResources;
}) {
  return (
    <PanelGroup title="Keeping an eye on" aside={items.length}>
      <PanelCard>
        <PanelList>
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2.5 px-3 py-2 text-sm">
              <EyeIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "break-words",
                    item.status !== "open" && "text-muted-foreground line-through",
                  )}
                >
                  {item.title}
                </p>
                {item.note ? (
                  <p className="line-clamp-3 text-xs text-muted-foreground">{item.note}</p>
                ) : null}
                {/^https?:\/\//i.test(item.sourceUrl) ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Source
                  </a>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  size="xs"
                  variant="ghost-muted"
                  disabled={resources.disabled}
                  onClick={() =>
                    void resources.save({
                      type: "follow-up.save",
                      item: { ...item, status: item.status === "open" ? "resolved" : "open" },
                    })
                  }
                >
                  {item.status === "open" ? "Resolve" : "Reopen"}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`Dismiss ${item.title}`}
                  disabled={resources.disabled}
                  onClick={() => void resources.save({ type: "follow-up.delete", key: item.key })}
                >
                  <XIcon />
                </Button>
              </div>
            </li>
          ))}
        </PanelList>
      </PanelCard>
    </PanelGroup>
  );
}

/** Skills and secrets the bot saved, in one card; the user can only delete them. */
export function BotSavedResources({
  state,
  resources,
}: {
  state: Pick<NonNullable<BotResources["query"]["data"]>, "skills" | "secrets">;
  resources: BotResources;
}) {
  return (
    <>
      {state.skills.length > 0 ? (
        <PanelGroup title="Skills" aside={state.skills.length}>
          <PanelCard>
            <PanelList>
              {state.skills.map((skill) => (
                <li
                  key={`skill:${skill.key}`}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm"
                >
                  <SparklesIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{skill.key}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {skill.description || `skills/${skill.key}.md`}
                    </p>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Delete skill ${skill.key}`}
                    disabled={resources.disabled}
                    onClick={() => void resources.save({ type: "skill.delete", key: skill.key })}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </PanelList>
          </PanelCard>
        </PanelGroup>
      ) : null}
      {state.secrets.length > 0 ? (
        <PanelGroup title="Secrets" aside={state.secrets.length}>
          <PanelCard>
            <PanelList>
              {state.secrets.map((secret) => (
                <li
                  key={`secret:${secret.key}`}
                  className="flex min-h-10 items-center gap-2.5 px-3 py-2 text-sm"
                >
                  <KeyRoundIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{secret.key}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Delete secret ${secret.key}`}
                    disabled={resources.disabled}
                    onClick={() => void resources.save({ type: "secret.delete", key: secret.key })}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </PanelList>
          </PanelCard>
        </PanelGroup>
      ) : null}
    </>
  );
}

/** The Autonomy tab: automatic check-in settings, saved as they change. */
export function BotAutonomyTab({ bot }: { bot: BotIdentity }) {
  const { query } = useBotResources(bot);
  const state = query.data;
  if (!state)
    return (
      <div className="px-7 pt-4">
        <PanelEmpty>{query.error ?? "Loading check-ins…"}</PanelEmpty>
      </div>
    );
  return (
    <>
      {query.error ? (
        <p role="alert" className="px-7 pt-4 text-xs text-destructive">
          {query.error}
        </p>
      ) : null}
      <CheckInSection
        // A different bot gets its own draft.
        key={`${bot.ownerEnvironmentId}:${bot.id}`}
        bot={bot}
        server={state.checkIn}
        lastCheckIn={state.lastCheckIn}
        refresh={query.refresh}
      />
    </>
  );
}

type SaveStatus = "idle" | "saving" | "failed";

/**
 * Check-in settings save on every change. Each request carries the full latest
 * draft and at most one is in flight, so quick edits collapse into one follow-up
 * request and can never be overwritten by an older response.
 */
function CheckInSection({
  bot,
  server,
  lastCheckIn,
  refresh,
}: {
  bot: BotIdentity;
  server: CheckInSettings;
  lastCheckIn: number | null;
  refresh: () => void;
}) {
  const environmentId = bot.ownerEnvironmentId;
  // Failures show inline with a retry instead of a toast.
  const change = useAtomCommand(botResourcesChange, {
    label: "bot check-in settings",
    reportFailure: false,
  });
  const check = useAtomCommand(botCheckIn, { label: "bot check-in" });
  const canChange = useAtomValue(botResourcesChange.permissionAtom(environmentId));
  const canCheck = useAtomValue(botCheckIn.permissionAtom(environmentId));
  const [draft, setDraft] = useState<{ value: CheckInSettings; base: CheckInSettings } | null>(
    null,
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [checking, setChecking] = useState(false);
  const latest = useRef<CheckInSettings>(server);
  const observedServer = useRef(server);
  // oxlint-disable-next-line blobs/no-unreasoned-state-sync -- records externally fetched snapshots for in-flight save acknowledgements
  useEffect(() => {
    observedServer.current = server;
  }, [server]);
  const inFlight = useRef(false);

  // A successful save keeps its draft until a subsequent query returns.
  if (draft !== null && status === "idle" && draft.base !== server) setDraft(null);

  const settings = draft?.value ?? server;
  const disabled = !canChange || bot.status !== "active";
  const activeStart = settings.quietEnd;
  const activeEnd = settings.quietStart;

  async function flush() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("saving");
    try {
      let sent: CheckInSettings;
      let saved: boolean;
      do {
        sent = latest.current;
        const result = await change({
          environmentId,
          input: { botId: bot.id, action: { type: "check-in.configure", settings: sent } },
        });
        saved = result._tag === "Success";
        // Edits made while a request was out go in the next one, even after a failure.
      } while (latest.current !== sent);
      if (saved) {
        setDraft({ value: sent, base: observedServer.current });
        refresh();
      }
      setStatus(saved ? "idle" : "failed");
    } catch (error) {
      inFlight.current = false;
      setStatus("failed");
      throw error;
    }
    inFlight.current = false;
  }

  function update(patch: Partial<CheckInSettings>) {
    const base = inFlight.current || draft !== null ? latest.current : server;
    latest.current = { ...base, ...patch };
    setDraft({ value: latest.current, base: draft?.base ?? server });
    void flush();
  }

  const timezones = TIMEZONES.has(settings.timezone)
    ? [...TIMEZONES]
    : [settings.timezone, ...TIMEZONES];
  const id = useId();

  return (
    <PanelGroup
      title="Check-ins"
      aside={
        <>
          {status === "idle" ? null : (
            <div
              role={status === "failed" ? "alert" : "status"}
              className="flex items-center gap-1 text-xs"
            >
              <span
                className={
                  status === "failed" ? "text-destructive-foreground" : "text-muted-foreground"
                }
              >
                {status === "failed" ? "Not saved" : "Saving…"}
              </span>
              {status === "failed" ? (
                <Button size="xs" variant="ghost-muted" onClick={() => void flush()}>
                  Retry
                </Button>
              ) : null}
            </div>
          )}
        </>
      }
    >
      <PanelCard>
        <div className="divide-y divide-border/60 [&>*]:px-3 [&>*]:py-3">
          <PanelField label="Automatic check-ins" htmlFor={`${id}-enabled`}>
            <Switch
              id={`${id}-enabled`}
              size="sm"
              checked={settings.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) => update({ enabled })}
            />
          </PanelField>
          {settings.enabled ? (
            <>
              <PanelField label="Every" htmlFor={`${id}-every`}>
                <Select
                  value={String(settings.everyHours)}
                  onValueChange={(value) => {
                    if (value !== null) update({ everyHours: Number(value) });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={`${id}-every`} size="sm" variant="ghost" className="w-36">
                    <SelectValue>{settings.everyHours} h</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {withCurrent(EVERY_HOURS, settings.everyHours).map((hours) => (
                      <SelectItem hideIndicator key={hours} value={String(hours)}>
                        {hours} h
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </PanelField>
              <PanelField label="Max per day" htmlFor={`${id}-max`}>
                <Select
                  value={String(settings.maxPerDay)}
                  onValueChange={(value) => {
                    if (value !== null) update({ maxPerDay: Number(value) });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={`${id}-max`} size="sm" variant="ghost" className="w-36">
                    <SelectValue>{settings.maxPerDay}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {withCurrent(MAX_PER_DAY, settings.maxPerDay).map((count) => (
                      <SelectItem hideIndicator key={count} value={String(count)}>
                        {count}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </PanelField>
              <PanelField label="Time zone" htmlFor={`${id}-timezone`}>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) => {
                    if (value !== null) update({ timezone: value });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={`${id}-timezone`} size="sm" variant="ghost" className="w-36">
                    <SelectValue>{settings.timezone}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false} matchTriggerWidth={false}>
                    {timezones.map((timezone) => (
                      <SelectItem hideIndicator key={timezone} value={timezone}>
                        {timezone}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </PanelField>
              <ActiveHoursField
                id={`${id}-active`}
                start={activeStart}
                end={activeEnd}
                days={settings.activeDays}
                disabled={disabled}
                onHoursChange={(start, end) => update({ quietEnd: start, quietStart: end })}
                onDaysChange={(activeDays) => update({ activeDays })}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={disabled || !canCheck || checking}
                  onClick={async () => {
                    setChecking(true);
                    await check({ environmentId, input: { botId: bot.id } }).finally(() =>
                      setChecking(false),
                    );
                    refresh();
                  }}
                >
                  Check in now
                </Button>
                <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                  {lastCheckIn === null
                    ? "Never checked in"
                    : `Last ${formatRelativeTimeLabel(new Date(lastCheckIn).toISOString())}`}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </PanelCard>
    </PanelGroup>
  );
}
