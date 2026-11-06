import { DateTime } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { botDockState, botTaskState } from "./BotWorkTab.logic";

describe("botTaskState", () => {
  const idle = {
    pendingRuntimeRequest: null,
    hasActionableProposedPlan: false,
    activityRunStatus: null,
    status: "idle" as const,
  };

  it("keeps a proposed plan needing input out of earlier work", () => {
    expect(botTaskState({ ...idle, hasActionableProposedPlan: true })).toBe("waiting");
    expect(
      botTaskState({ ...idle, hasActionableProposedPlan: true, activityRunStatus: "running" }),
    ).toBe("waiting");
    expect(
      botDockState([
        { ...idle, status: "running" },
        { ...idle, hasActionableProposedPlan: true },
      ]),
    ).toBe("waiting");
  });

  it("keeps active threads in progress when activity summaries are absent", () => {
    for (const status of ["preparing", "queued", "starting", "running", "waiting"] as const) {
      expect(botTaskState({ ...idle, status })).toBe("running");
    }
    expect(botTaskState(idle)).toBe("done");
    expect(botDockState([idle, { ...idle, status: "running" }])).toBe("running");
    expect(botDockState([idle])).toBe("idle");
    expect(botDockState([])).toBe("idle");
    const completed = { ...idle, latestRunCompletedAt: DateTime.makeUnsafe(0) };
    expect(botDockState([completed], true)).toBe("done");
    expect(botDockState([completed], false)).toBe("idle");
  });
});
