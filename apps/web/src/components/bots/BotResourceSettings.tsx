import { DEFAULT_SERVER_SETTINGS } from "@satslab/contracts";
import { SettingResetButton, SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { searchableSetting } from "../settings/settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "../settings/useScopedSettings";
import { Switch } from "../ui/switch";
import { Textarea, type TextareaProps } from "../ui/textarea";

/** The text area for a bot's role; saves when focus leaves it. */
export function BotRoleField(props: Pick<TextareaProps, "id" | "unstyled">) {
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

/** A bot project's role, which its system prompt carries, and whether replies load the provider's own instructions and skills. */
export function BotResourceSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["botLoadResources"]);
  return (
    <SettingsSection id="bot-instructions" title="Instructions">
      <SettingsRow
        title="Role"
        description="Added to the bot's system prompt under Role. Applies from the next reply."
        resetAction={
          settings.botRole !== DEFAULT_SERVER_SETTINGS.botRole ? (
            <SettingResetButton
              label="bot role"
              onClick={() => updateSettings({ botRole: DEFAULT_SERVER_SETTINGS.botRole })}
            />
          ) : null
        }
      >
        <div className="mt-3 pb-2">
          <BotRoleField />
        </div>
      </SettingsRow>
      <SettingsRow
        serverScoped
        settingKeys={["botLoadResources"]}
        mixed={mixed}
        {...searchableSetting("bot-load-resources")}
        description="Lets replies use the provider's global and workspace instruction files (AGENTS.md, CLAUDE.md) and skills. Their effects can appear in replies and tool results saved to memory. Memory compaction never loads them. Applies from the next reply."
        resetAction={
          settings.botLoadResources !== DEFAULT_SERVER_SETTINGS.botLoadResources ? (
            <SettingResetButton
              label="bot instructions and skills"
              onClick={() =>
                updateSettings({ botLoadResources: DEFAULT_SERVER_SETTINGS.botLoadResources })
              }
            />
          ) : null
        }
        control={
          <Switch
            aria-label="Load instructions and skills"
            mixed={mixed}
            checked={mixed ? false : settings.botLoadResources}
            onCheckedChange={(enabled) => updateSettings({ botLoadResources: enabled })}
          />
        }
      />
    </SettingsSection>
  );
}
