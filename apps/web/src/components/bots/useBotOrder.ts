import type { EnvironmentThreadShell } from "@satslab/client-runtime/state/shell";
import type { BotIdentity } from "@satslab/contracts";
import { useState } from "react";

import { useBots, useBotThreadShells } from "../../state/bots";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { planSidebarThreadDrop } from "../Sidebar.logic";
import { toastManager } from "../ui/toast";

export type BotRow = {
  bot: BotIdentity;
  thread: EnvironmentThreadShell | undefined;
  pinned: boolean;
  orderKey: string | null;
};
type BotPlacement = { id: string; pinned: boolean; orderKey: string | null };

const isPinned = (row: BotRow) => row.pinned;
const orderKey = (row: BotRow) => row.orderKey;

/**
 * Bots in their saved order, pinned first, with optimistic reordering. Shared by every bot list so
 * they all show and write the same order.
 */
export function useBotOrder() {
  const bots = useBots();
  const threads = useBotThreadShells();
  const pin = useOrchestrationCommand(threadEnvironment.pin);
  const unpin = useOrchestrationCommand(threadEnvironment.unpin);
  const reorderPin = useOrchestrationCommand(threadEnvironment.reorderPin);
  const reorderActive = useOrchestrationCommand(threadEnvironment.reorderActive);
  const [optimistic, setOptimistic] = useState<BotPlacement[] | null>(null);
  const canonicalRows = bots.map((bot) => {
    const thread = threads.find(
      (thread) => thread.id === bot.threadId && thread.environmentId === bot.ownerEnvironmentId,
    );
    const pinned = thread?.pinnedAt != null;
    return {
      bot,
      thread,
      pinned,
      orderKey: (pinned ? thread?.pinOrderKey : thread?.activeOrderKey) ?? null,
    };
  });
  const caughtUp = optimistic?.every((placement) => {
    const row = canonicalRows.find((row) => row.bot.id === placement.id);
    return !row || (row.pinned === placement.pinned && row.orderKey === placement.orderKey);
  });
  if (caughtUp) setOptimistic(null);
  const placements = caughtUp ? null : optimistic;
  const rows = canonicalRows.map((row) => {
    const placement = placements?.find((placement) => placement.id === row.bot.id);
    return placement ? { ...row, pinned: placement.pinned, orderKey: placement.orderKey } : row;
  });
  rows.sort((a, b) => {
    const aKey = orderKey(a),
      bKey = orderKey(b);
    if (aKey !== null && bKey !== null && aKey !== bKey) return aKey < bKey ? -1 : 1;
    if (aKey !== null) return -1;
    if (bKey !== null) return 1;
    return a.bot.name.localeCompare(b.bot.name) || a.bot.id.localeCompare(b.bot.id);
  });
  const pinned = rows.filter(isPinned);
  const active = rows.filter((row) => !isPinned(row));
  const busy = placements !== null;
  const commit = async (placements: BotPlacement[], write: () => Promise<boolean>) => {
    setOptimistic(placements);
    try {
      if (await write()) return;
    } catch {
      // Commands normally return a failure result; transport interruption can reject.
    }
    setOptimistic((current) => (current === placements ? null : current));
    toastManager.add({ type: "error", title: "Could not update bot order" });
  };
  const applyOrder = async (source: BotRow, destinationPinned: boolean, next: BotRow[]) => {
    const order = next.map((row) => String(row.bot.id));
    const pinnedOrder = pinned.map((row) => String(row.bot.id));
    const activeOrder = active.map((row) => String(row.bot.id));
    const plan = planSidebarThreadDrop({
      activeKey: source.bot.id,
      activeSection: source.pinned ? "pinned" : "active",
      supportsSettlement: false,
      target: {
        section: destinationPinned ? "pinned" : "active",
        pinnedOrder: destinationPinned ? order : pinnedOrder,
        activeOrder: destinationPinned ? activeOrder : order,
      },
      pinnedOrder,
      activeOrder,
      pinnedKeysById: new Map(pinned.map((row) => [String(row.bot.id), orderKey(row)])),
      activeKeysById: new Map(active.map((row) => [String(row.bot.id), orderKey(row)])),
    });
    if (plan.kind === "none" || plan.kind === "settle") return;
    const writes =
      plan.kind === "pin"
        ? [
            ...(plan.orderKey === undefined
              ? []
              : [{ id: String(source.bot.id), orderKey: plan.orderKey }]),
            ...plan.extraAssignments,
          ]
        : plan.assignments;
    const placements = writes.map((write) => ({
      id: write.id,
      pinned: destinationPinned,
      orderKey: write.orderKey,
    }));
    if (writes.length === 0) return;
    await commit(placements, async () => {
      for (const write of writes) {
        const row = next.find((row) => row.bot.id === write.id);
        if (!row) continue;
        const environmentId = row.bot.ownerEnvironmentId;
        const input = { threadId: row.bot.threadId, orderKey: write.orderKey };
        if (destinationPinned && !isPinned(row)) {
          const result = await pin({ environmentId, input });
          if (result._tag !== "Success") return false;
        } else {
          if (!destinationPinned && isPinned(row)) {
            const result = await unpin({ environmentId, input: { threadId: row.bot.threadId } });
            if (result._tag !== "Success") return false;
          }
          const result = await (destinationPinned ? reorderPin : reorderActive)({
            environmentId,
            input,
          });
          if (result._tag !== "Success") return false;
        }
      }
      return true;
    });
  };
  const togglePin = (row: BotRow) => {
    if (busy) return;
    const destinationPinned = !isPinned(row);
    const destination = destinationPinned ? pinned : active;
    void applyOrder(row, destinationPinned, [row, ...destination]);
  };
  return { rows, pinned, active, busy, applyOrder, togglePin };
}
