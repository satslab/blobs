import type { OrchestrationV2ThreadShell } from "@satslab/contracts";

export function botTaskState(
  thread: Pick<
    OrchestrationV2ThreadShell,
    "pendingRuntimeRequest" | "hasActionableProposedPlan" | "activityRunStatus" | "status"
  >,
) {
  if (thread.pendingRuntimeRequest !== null || thread.hasActionableProposedPlan)
    return "waiting" as const;
  if (
    thread.activityRunStatus != null ||
    ["preparing", "queued", "starting", "running", "waiting"].includes(thread.status)
  )
    return "running" as const;
  return thread.status === "failed" ? ("failed" as const) : ("done" as const);
}

export function botDockState(
  threads: ReadonlyArray<Parameters<typeof botTaskState>[0]>,
  hasUnseenCompletion = false,
) {
  if (threads.some((thread) => botTaskState(thread) === "waiting")) return "waiting";
  if (threads.some((thread) => botTaskState(thread) === "running")) return "running";
  return hasUnseenCompletion ? "done" : "idle";
}
