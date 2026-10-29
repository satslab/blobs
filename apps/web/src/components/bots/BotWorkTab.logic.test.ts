import { describe, expect, it } from "vite-plus/test";
import { botTaskState } from "./BotWorkTab.logic";

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
  });

  it("keeps active threads in progress when activity summaries are absent", () => {
    expect(botTaskState({ ...idle, status: "running" })).toBe("running");
    expect(botTaskState(idle)).toBe("done");
  });
});
