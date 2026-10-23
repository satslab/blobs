import type { BotDiscordStatus, BotDiscordSettings } from "@satslab/contracts";

export function discordPanelStatus(status: BotDiscordStatus) {
  if (!status.settings.enabled) return "Off";
  if (!status.credentialConfigured) return "Token required";
  switch (status.connection) {
    case "disabled":
      return "Not connected";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "error":
      return "Connection failed";
  }
}

export function discordUserPolicyLabel(policy: BotDiscordSettings["userPolicy"]) {
  const count = policy.userIds.length;
  return count === 0 ? "Everyone" : `${count} ${policy.mode === "allow" ? "allowed" : "blocked"}`;
}
