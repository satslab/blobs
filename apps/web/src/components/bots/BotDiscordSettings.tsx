import { useAtomValue } from "@effect/atom-react";
import { useId, useState } from "react";
import {
  BotDiscordSettings as DiscordSettings,
  type BotDiscordStatus,
  type BotIdentity,
} from "@satslab/contracts";
import { XIcon } from "lucide-react";
import * as Schema from "effect/Schema";
import { useAtomCommand } from "../../state/use-atom-command";
import { botDiscordConfigure, botDiscordSetCredential } from "../../state/botDiscord";
import { Button } from "../ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RefreshIcon } from "../ui/refresh-icon";
import { Toggle, ToggleGroup } from "../ui/toggle-group";

const sameSettings = Schema.toEquivalence(DiscordSettings);

const connectionLabels = {
  disabled: "Disabled",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection failed",
};

/**
 * Discord setup for one bot, as the body of a dialog. Turning Discord on or off is the footer's
 * main action; the rest saves together.
 */
export function BotDiscordDialog({
  bot,
  saved,
  disabled,
  refresh,
  onDone,
}: {
  bot: BotIdentity;
  saved: BotDiscordStatus;
  disabled: boolean;
  refresh: () => void;
  onDone: () => void;
}) {
  const configure = useAtomCommand(botDiscordConfigure);
  const setCredential = useAtomCommand(botDiscordSetCredential);
  const canConfigure = useAtomValue(botDiscordConfigure.permissionAtom(bot.ownerEnvironmentId));
  const canSetCredential = useAtomValue(
    botDiscordSetCredential.permissionAtom(bot.ownerEnvironmentId),
  );
  const tokenId = useId();
  const usersId = useId();
  const [draft, setDraft] = useState<Partial<DiscordSettings>>({});
  const [ids, setIds] = useState<ReadonlyArray<string> | null>(null);
  const [entry, setEntry] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const values = { ...saved.settings, ...draft };
  const listedIds = ids ?? values.userPolicy.userIds;
  // Text still in the box counts too, so saving never drops an ID that wasn't entered yet.
  const typedIds = entry.split(/[\s,]+/).filter(Boolean);
  const invalidUsers = typedIds.some((id) => !/^[0-9]{1,20}$/.test(id));
  const userIds = [...new Set([...listedIds, ...typedIds])];
  const addEntry = () => {
    if (typedIds.length === 0 || invalidUsers) return;
    setIds(userIds);
    setEntry("");
  };
  const settings = { ...values, userPolicy: { ...values.userPolicy, userIds } };
  const enabled = saved.settings.enabled;
  const changed = !sameSettings(settings, saved.settings) || token.trim() !== "";
  const hasToken = saved.credentialConfigured || token.trim() !== "";
  const locked = disabled || busy || !canConfigure;
  const status =
    enabled && saved.connection === "disabled"
      ? saved.credentialConfigured
        ? "Not connected"
        : "Token required"
      : connectionLabels[saved.connection];

  // Saves a typed token first, then the settings, so turning on never runs without one.
  const save = async (next: DiscordSettings) => {
    if (locked || invalidUsers) return;
    setBusy(true);
    const typed = token.trim();
    if (typed !== "" && canSetCredential) {
      const result = await setCredential({
        environmentId: bot.ownerEnvironmentId,
        input: { botId: bot.id, token: typed },
      });
      if (result._tag !== "Success") return setBusy(false);
      setToken("");
    }
    const result = await configure({
      environmentId: bot.ownerEnvironmentId,
      input: { botId: bot.id, settings: next },
    });
    setBusy(false);
    refresh();
    if (result._tag === "Success") onDone();
  };

  const removeToken = async () => {
    if (locked || !canSetCredential) return;
    setBusy(true);
    const result = await setCredential({
      environmentId: bot.ownerEnvironmentId,
      input: { botId: bot.id, token: null },
    });
    setBusy(false);
    if (result._tag === "Success") refresh();
  };

  return (
    <DialogPopup>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ ...settings, enabled: true });
        }}
      >
        <DialogHeader>
          <DialogTitle>Discord</DialogTitle>
          <DialogDescription>
            <span className="inline-flex items-center gap-1.5">
              <span role="status">{status}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Refresh Discord status"
                disabled={busy}
                onClick={refresh}
              >
                <RefreshIcon size="xs" />
              </Button>
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-6">
            {saved.error ? (
              <p role="alert" className="text-sm text-destructive">
                {saved.error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={tokenId}>Bot token</Label>
                {saved.credentialConfigured ? (
                  <Button
                    size="xs"
                    variant="ghost-destructive"
                    disabled={!canSetCredential}
                    onClick={() => void removeToken()}
                  >
                    Remove token
                  </Button>
                ) : null}
              </div>
              <Input
                id={tokenId}
                type="password"
                autoComplete="new-password"
                placeholder={
                  saved.credentialConfigured
                    ? "Saved. Paste a new token to replace it."
                    : "Paste the token from the Discord Developer Portal"
                }
                value={token}
                disabled={!canSetCredential}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            <DiscordChoice
              label="Listens to"
              value={values.interactionMode}
              options={[
                ["mention-only", "Mentions"],
                ["all-messages", "All messages"],
              ]}
              onChange={(interactionMode) => setDraft({ ...draft, interactionMode })}
            />
            <DiscordChoice
              label="Replies"
              value={values.replyMode}
              options={[
                ["thread", "In a thread"],
                ["message", "To the message"],
              ]}
              onChange={(replyMode) => setDraft({ ...draft, replyMode })}
            />
            <div className="flex flex-col gap-2">
              <DiscordChoice
                label="Users"
                value={values.userPolicy.mode}
                options={[
                  ["allow", "Allow list"],
                  ["block", "Block list"],
                ]}
                onChange={(mode) =>
                  setDraft({ ...draft, userPolicy: { ...values.userPolicy, mode } })
                }
              />
              <Input
                id={usersId}
                aria-label="Add a Discord user ID"
                aria-invalid={invalidUsers}
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addEntry();
                  } else if (event.key === "Backspace" && entry === "" && listedIds.length > 0) {
                    setIds(listedIds.slice(0, -1));
                  }
                }}
                placeholder="Discord user ID, then Enter"
              />
              {invalidUsers ? (
                <p className="text-xs text-destructive">Discord user IDs are numbers only.</p>
              ) : listedIds.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {values.userPolicy.mode === "allow"
                    ? "No one listed, so everyone can talk to the bot."
                    : "No one listed, so no one is blocked."}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {listedIds.map((id) => (
                    <li
                      key={id}
                      className="flex items-center gap-0.5 rounded-md bg-muted/70 py-0.5 ps-2 pe-0.5 font-mono text-xs"
                    >
                      {id}
                      <Button
                        size="icon-micro"
                        variant="ghost-muted"
                        aria-label={`Remove ${id}`}
                        onClick={() => setIds(listedIds.filter((other) => other !== id))}
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>
        </DialogPanel>
        <DialogFooter>
          {enabled ? (
            <Button
              variant="destructive-outline"
              disabled={locked}
              onClick={() => void save({ ...saved.settings, enabled: false })}
              className="sm:me-auto"
            >
              Turn off
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={locked || invalidUsers || !hasToken || (enabled && !changed)}
          >
            {busy ? "Saving…" : enabled ? "Save" : "Turn on"}
          </Button>
        </DialogFooter>
      </form>
    </DialogPopup>
  );
}

function DiscordChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      <ToggleGroup
        aria-label={label}
        value={[value]}
        onValueChange={(next) => {
          const picked = options.find(([option]) => option === next[0]);
          if (picked) onChange(picked[0]);
        }}
      >
        {options.map(([option, text]) => (
          <Toggle key={option} value={option}>
            {text}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
