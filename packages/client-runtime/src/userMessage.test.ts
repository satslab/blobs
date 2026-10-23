import { describe, expect, it } from "vite-plus/test";

import { GuestMessageId } from "@satslab/contracts";

import { resolveUserMessagePresentation } from "./userMessage.ts";

describe("resolveUserMessagePresentation", () => {
  const discordInput = {
    source: "discord",
    routeId: "bot:100",
    guildId: "30",
    channelId: "20",
    messageId: "100",
    sender: { id: "40", displayName: "Chan" },
    text: "Who are you?",
    attachments: [],
  };
  const discordText = `Discord routing instructions.\n\n${JSON.stringify(discordInput)}`;

  it("folds Discord input as an agent-style message with the sender and actual message", () => {
    expect(
      resolveUserMessagePresentation({
        id: "bot-input:bot:100",
        role: "user",
        createdBy: "user",
        creationSource: "server",
        text: discordText,
      }),
    ).toEqual({
      text: "Who are you?",
      attribution: "agent",
      sourceLabel: "Discord · Chan",
      scheduledTaskId: undefined,
    });
  });

  it("keeps ordinary user text and malformed integration input intact", () => {
    for (const patch of [
      { id: "user-message", creationSource: "web" as const, text: discordText },
      {
        id: "bot-input:bot:100",
        creationSource: "server" as const,
        text: "Not a Discord envelope",
      },
      {
        id: "bot-input:bot:100",
        creationSource: "server" as const,
        text: `Instructions\n\n${JSON.stringify({ ...discordInput, source: "unknown" })}`,
      },
    ]) {
      expect(
        resolveUserMessagePresentation({ role: "user", createdBy: "user", ...patch }),
      ).toMatchObject({ text: patch.text, attribution: null });
    }
  });

  it("folds server check-ins as automation without treating pasted instructions as automation", () => {
    const text = "Automatic check-in. Review your open follow-ups.";
    const message = {
      id: "bot-check-in:bot:1793250000000",
      role: "user",
      createdBy: "user" as const,
      text,
    };
    expect(resolveUserMessagePresentation({ ...message, creationSource: "server" })).toEqual({
      text,
      attribution: "automation",
      sourceLabel: "Automatic check-in",
      scheduledTaskId: undefined,
    });
    expect(
      resolveUserMessagePresentation({ ...message, creationSource: "web" }).attribution,
    ).toBeNull();
    expect(
      resolveUserMessagePresentation({ ...message, id: "ordinary", creationSource: "server" })
        .attribution,
    ).toBeNull();
  });

  const legacyText = "[Triggered by schedule task: Daily audit]\n\nCheck for crashes.\n";

  it("preserves user-written and assistant-quoted schedule headers", () => {
    for (const message of [
      { role: "user", createdBy: "user" as const },
      { role: "user" },
      { role: "assistant", createdBy: "agent" as const },
    ]) {
      expect(resolveUserMessagePresentation({ ...message, text: legacyText })).toEqual({
        text: legacyText,
        attribution: null,
        scheduledTaskId: undefined,
      });
    }
  });

  it("shows a guest's own words and name, not the attributed text the agent reads", () => {
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "user",
        text: "Message from guest Sam, sent by the owner:\n\nWhy?",
        context: {
          guest: {
            guestMessageId: GuestMessageId.make("guest-message:one"),
            name: "Sam",
            text: "Why?",
          },
        },
      }),
    ).toEqual({ text: "Why?", attribution: "guest", scheduledTaskId: undefined, guestName: "Sam" });
  });

  it("attributes older server-sent restart continuations to Blobs, not another agent", () => {
    const text = "Note: the T3 server restarted.";
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        creationSource: "server",
        text,
      }),
    ).toMatchObject({ attribution: "blobs" });
    for (const creationSource of ["mcp", "provider"] as const) {
      expect(
        resolveUserMessagePresentation({ role: "user", createdBy: "agent", creationSource, text }),
      ).toMatchObject({ attribution: "agent" });
    }
  });

  it("recovers the triggering automation from older scheduler message ids", () => {
    for (const trigger of ["scheduled", "manual"]) {
      expect(
        resolveUserMessagePresentation({
          id: `scheduled-task-message:task:daily-audit:1788661140000:${trigger}`,
          role: "user",
          createdBy: "user",
          text: legacyText,
        }),
      ).toEqual({
        text: "Check for crashes.\n",
        attribution: "automation",
        scheduledTaskId: "task:daily-audit",
      });
    }
  });
});
