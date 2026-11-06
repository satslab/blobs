import { RegistryContext } from "@effect/atom-react";
import type { BotIdentity } from "@satslab/contracts";
import { useContext, useId } from "react";
import { botList, botRename } from "../../state/bots";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "../settings/useScopedSettings";
import { Switch } from "../ui/switch";
import { Textarea, type TextareaProps } from "../ui/textarea";

/** The text area for a bot's role; saves when focus leaves it. */
export function BotRoleField(props: Pick<TextareaProps, "id" | "unstyled" | "autoFocus">) {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["botRole"]);
  return (
    <Textarea
      {...props}
      key={settings.botRole}
      defaultValue={mixed ? "" : settings.botRole}
      onBlur={(event) => {
        const botRole = event.target.value.trim();
        if (botRole !== settings.botRole) updateSettings({ botRole });
      }}
      rows={6}
      placeholder="You are a release manager. Keep replies short and ask before merging."
      aria-label="Bot role"
    />
  );
}

/** The bot's name as the page title; click to edit, saved when focus leaves it. */
export function BotNameField({ bot, disabled }: { bot: BotIdentity; disabled: boolean }) {
  const registry = useContext(RegistryContext);
  const renameBot = useAtomCommand(botRename, { label: "rename bot" });
  const rename = async (name: string) => {
    if (name === "" || name === bot.name) return;
    const result = await renameBot({
      environmentId: bot.ownerEnvironmentId,
      input: { botId: bot.id, name },
    });
    if (result._tag === "Success")
      registry.refresh(botList({ environmentId: bot.ownerEnvironmentId, input: {} }));
  };
  return (
    <input
      // Remount on a rename from elsewhere so the field shows it.
      key={bot.name}
      aria-label="Bot name"
      defaultValue={bot.name}
      maxLength={255}
      disabled={disabled}
      onBlur={(event) => void rename(event.target.value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = bot.name;
          event.currentTarget.blur();
        }
      }}
      className="w-full truncate rounded-lg bg-transparent px-2 text-center text-2xl font-semibold tracking-tight outline-hidden hover:bg-muted/60 focus-visible:bg-muted/60 disabled:hover:bg-transparent"
    />
  );
}

/** Whether replies load the provider's own instruction files and skills. */
export function BotInstructionsSwitch({ disabled }: { disabled: boolean }) {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["botLoadResources"]);
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 text-sm">
        Instructions and skills
        <span className="block text-xs text-muted-foreground">
          Load AGENTS.md, CLAUDE.md, and provider skills
        </span>
      </label>
      <Switch
        id={id}
        mixed={mixed}
        disabled={disabled}
        checked={mixed ? false : settings.botLoadResources}
        onCheckedChange={(enabled) => updateSettings({ botLoadResources: enabled })}
      />
    </div>
  );
}
