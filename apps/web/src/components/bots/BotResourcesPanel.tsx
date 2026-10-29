import { useEffect, useId, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { BotCheckInSettings, BotIdentity, BotResourceAction } from "@satslab/contracts";
import { botResources, botResourcesChange, botCheckIn } from "../../state/botResources";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { PanelEmpty, PanelField, PanelRows, PanelSection } from "./BotPanelParts";
import { QuietHoursField } from "./QuietHoursField";

type CheckInSettings = typeof BotCheckInSettings.Type;

const EVERY_HOURS = [1, 2, 3, 4, 6, 8, 12, 24];
const MAX_PER_DAY = [1, 2, 3, 4, 5, 6, 8, 10, 12, 24, 50];
const TIMEZONES = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);

const withCurrent = (options: readonly number[], current: number) =>
  options.includes(current) ? options : [...options, current].toSorted((a, b) => a - b);

export function BotResourcesPanel({
  bot,
  section = "all",
}: {
  bot: BotIdentity;
  section?: "all" | "work" | "autonomy";
}) {
  const environmentId = bot.ownerEnvironmentId;
  const query = useEnvironmentQuery(botResources({ environmentId, input: { botId: bot.id } }));
  const change = useAtomCommand(botResourcesChange, { label: "bot resources" });
  const canChange = useAtomValue(botResourcesChange.permissionAtom(environmentId));
  const [busy, setBusy] = useState(false);
  const state = query.data;
  const disabled = !canChange || busy || bot.status !== "active";
  async function save(action: BotResourceAction) {
    setBusy(true);
    try {
      const result = await change({ environmentId, input: { botId: bot.id, action } });
      if (result._tag === "Success") query.refresh();
    } finally {
      setBusy(false);
    }
  }
  const work = section === "all" || section === "work";
  const autonomy = section === "all" || section === "autonomy";
  if (!state) return <PanelEmpty>{query.error ?? "Loading bot resources…"}</PanelEmpty>;
  return (
    <>
      {query.error ? <p role="alert">{query.error}</p> : null}
      {work ? (
        <>
          <PanelSection title="Keeping an eye on">
            {state.followUps.length === 0 ? <PanelEmpty>No follow-ups</PanelEmpty> : null}
            <PanelRows>
              {state.followUps.map((item) => (
                <li key={item.key}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-words">{item.title}</span>
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={disabled}
                      onClick={() =>
                        void save({
                          type: "follow-up.save",
                          item: { ...item, status: item.status === "open" ? "resolved" : "open" },
                        })
                      }
                    >
                      {item.status === "open" ? "Resolve" : "Reopen"}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={disabled}
                      onClick={() => void save({ type: "follow-up.delete", key: item.key })}
                    >
                      Dismiss
                    </Button>
                  </div>
                  {item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null}
                  {/^https?:\/\//i.test(item.sourceUrl) ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs underline"
                    >
                      Source
                    </a>
                  ) : null}
                </li>
              ))}
            </PanelRows>
          </PanelSection>
          <PanelSection title="Skills">
            {state.skills.length === 0 ? <PanelEmpty>No saved skills</PanelEmpty> : null}
            <PanelRows>
              {state.skills.map((skill) => (
                <li key={skill.key} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{skill.key}</p>
                    <p className="text-xs text-muted-foreground">{skill.description}</p>
                    <p className="text-xs text-muted-foreground">skills/{skill.key}.md</p>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost-muted"
                    disabled={disabled}
                    onClick={() => void save({ type: "skill.delete", key: skill.key })}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </PanelRows>
          </PanelSection>
          <PanelSection title="Secrets">
            {state.secrets.length === 0 ? <PanelEmpty>No saved secrets</PanelEmpty> : null}
            <PanelRows>
              {state.secrets.map((secret) => (
                <li key={secret.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{secret.key}</span>
                  <Button
                    size="xs"
                    variant="ghost-muted"
                    disabled={disabled}
                    onClick={() => void save({ type: "secret.delete", key: secret.key })}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </PanelRows>
          </PanelSection>
        </>
      ) : null}
      {autonomy ? (
        <CheckInSection
          // A different bot gets its own draft.
          key={`${environmentId}:${bot.id}`}
          bot={bot}
          server={state.checkIn}
          lastCheckIn={state.lastCheckIn}
          refresh={query.refresh}
        />
      ) : null}
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
    } finally {
      inFlight.current = false;
    }
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
    <PanelSection
      title="Automatic check-ins"
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
      footer={
        settings.enabled ? (
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="secondary"
              disabled={disabled || !canCheck || checking}
              onClick={async () => {
                setChecking(true);
                try {
                  await check({ environmentId, input: { botId: bot.id } });
                  refresh();
                } finally {
                  setChecking(false);
                }
              }}
            >
              Check in now
            </Button>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
              {lastCheckIn === null
                ? "Never checked in"
                : formatRelativeTimeLabel(new Date(lastCheckIn).toISOString())}
            </span>
          </div>
        ) : undefined
      }
    >
      <PanelField label="Enable" htmlFor={`${id}-enabled`}>
        <Switch
          id={`${id}-enabled`}
          size="sm"
          aria-label="Automatic check-ins"
          checked={settings.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </PanelField>
      {settings.enabled ? (
        <div className="mt-3 flex flex-col gap-2">
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
          <PanelField label="Timezone" htmlFor={`${id}-timezone`}>
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
          <QuietHoursField
            id={`${id}-quiet`}
            start={settings.quietStart}
            end={settings.quietEnd}
            disabled={disabled}
            onChange={update}
          />
        </div>
      ) : null}
    </PanelSection>
  );
}
