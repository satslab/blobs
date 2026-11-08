import type { ContextMenuItem } from "@satslab/contracts";

/** A context menu waiting on the phone layout's sheet, and how to answer whoever opened it. */
export interface MobileContextMenuRequest {
  readonly id: number;
  readonly items: readonly ContextMenuItem<string>[];
  readonly resolve: (id: string | null) => void;
}

let request: MobileContextMenuRequest | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function publish(next: MobileContextMenuRequest | null) {
  request = next;
  for (const listener of listeners) listener();
}

/** Whether the phone layout is showing, so menus open as its sheet instead of a popup. */
export function mobileContextMenuAvailable() {
  return typeof document !== "undefined" && document.querySelector("[data-mobile-frame]") !== null;
}

/** Opens a context menu as the phone layout's sheet. Resolves with the picked id, or null. */
export function showMobileContextMenu<T extends string>(
  items: readonly ContextMenuItem<T>[],
): Promise<T | null> {
  request?.resolve(null);
  return new Promise<T | null>((resolve) => {
    publish({ id: nextId++, items, resolve: (id) => resolve(id as T | null) });
  });
}

/** Answers and closes the open sheet menu, if any. */
export function settleMobileContextMenu(id: string | null) {
  const current = request;
  if (!current) return;
  publish(null);
  current.resolve(id);
}

export const mobileContextMenuStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => request,
};
