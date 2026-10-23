import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_BOT_DISCORD_SETTINGS, BotId, type BotDiscordStatus } from "@satslab/contracts";
import { discordPanelStatus, discordUserPolicyLabel } from "./BotIntegrationPanel.logic";

const connected: BotDiscordStatus = {
  botId: BotId.make("test"),
  settings: { ...DEFAULT_BOT_DISCORD_SETTINGS, enabled: true },
  credentialConfigured: true,
  connection: "connected",
  error: null,
};

describe("Discord panel status", () => {
  it("keeps disabled and missing credentials distinct from a live connection", () => {
    expect(discordPanelStatus({ ...connected, settings: DEFAULT_BOT_DISCORD_SETTINGS })).toBe(
      "Off",
    );
    expect(
      discordPanelStatus({ ...connected, credentialConfigured: false, connection: "disabled" }),
    ).toBe("Token required");
    expect(discordPanelStatus({ ...connected, connection: "disabled" })).toBe("Not connected");
    expect(discordPanelStatus(connected)).toBe("Connected");
    expect(discordPanelStatus({ ...connected, connection: "connecting" })).toBe("Connecting…");
    expect(discordPanelStatus({ ...connected, connection: "error", error: "Disconnected" })).toBe(
      "Connection failed",
    );
  });
  it("describes empty allow and block lists as unrestricted", () => {
    expect(discordUserPolicyLabel({ mode: "allow", userIds: [] })).toBe("Everyone");
    expect(discordUserPolicyLabel({ mode: "block", userIds: [] })).toBe("Everyone");
    expect(discordUserPolicyLabel({ mode: "allow", userIds: ["1", "2"] })).toBe("2 allowed");
    expect(discordUserPolicyLabel({ mode: "block", userIds: ["1"] })).toBe("1 blocked");
  });
});
