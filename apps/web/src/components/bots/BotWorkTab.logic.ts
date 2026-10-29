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
