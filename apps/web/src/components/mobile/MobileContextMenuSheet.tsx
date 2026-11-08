import type { ContextMenuItem } from "@satslab/contracts";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { createElement, useState, useSyncExternalStore } from "react";

import { ICON_PATHS } from "~/contextMenuFallback";
import { cn } from "~/lib/utils";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";
import {
  type MobileContextMenuRequest,
  mobileContextMenuStore,
  settleMobileContextMenu,
} from "./mobileContextMenu";
import { useDragToDismiss } from "./useDragToDismiss";

/**
 * The phone layout's context menus, as a bottom sheet of grouped rows. A submenu opens as its own
 * page with a back button.
 */
export function MobileContextMenuSheet() {
  const request = useSyncExternalStore(
    mobileContextMenuStore.subscribe,
    mobileContextMenuStore.getSnapshot,
    () => null,
  );
  return (
    <Sheet
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) settleMobileContextMenu(null);
      }}
    >
      <SheetPopup side="bottom" variant="rounded" showCloseButton={false}>
        {/* Keyed so each menu starts on its first page. */}
        {request ? <MenuPages key={request.id} request={request} /> : null}
      </SheetPopup>
    </Sheet>
  );
}

function MenuPages({ request }: { request: MobileContextMenuRequest }) {
  const [trail, setTrail] = useState<ReadonlyArray<ContextMenuItem<string>>>([]);
  const dragToDismiss = useDragToDismiss(() => settleMobileContextMenu(null));
  const parent = trail.at(-1);
  const items = parent?.children ?? request.items;
  const groups = groupItems(items);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white pb-safe dark:bg-card">
      <div {...dragToDismiss} className="relative shrink-0 touch-none px-3 pt-4 pb-2">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/20"
        />
        {parent ? (
          <button
            type="button"
            onClick={() => setTrail(trail.slice(0, -1))}
            className="flex h-10 items-center gap-1 rounded-full pe-3 text-base font-medium outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <ChevronLeftIcon className="size-5" />
            <SheetTitle render={<span />}>{parent.label}</SheetTitle>
          </button>
        ) : (
          <SheetTitle className="sr-only">Actions</SheetTitle>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {groups.map((group) => (
          <div key={group.items[0]?.id} className="pt-3 first:pt-0">
            {group.header ? (
              <p className="px-1 pb-2 text-sm font-medium text-muted-foreground">{group.header}</p>
            ) : null}
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-muted">
              {group.items.map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  onPick={() =>
                    item.children?.length
                      ? setTrail([...trail, item])
                      : settleMobileContextMenu(item.id)
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Splits a menu at its separators; a header item labels the group that follows it. */
function groupItems(items: readonly ContextMenuItem<string>[]) {
  const groups: Array<{ header: string | null; items: ContextMenuItem<string>[] }> = [];
  for (const item of items) {
    const current = groups.at(-1);
    if (item.header) {
      groups.push({ header: item.label, items: [] });
    } else if (!current || (item.separatorBefore && current.items.length > 0)) {
      groups.push({ header: null, items: [item] });
    } else {
      current.items.push(item);
    }
  }
  return groups.filter((group) => group.items.length > 0);
}

function MenuRow({ item, onPick }: { item: ContextMenuItem<string>; onPick: () => void }) {
  const hasChildren = (item.children?.length ?? 0) > 0;
  const destructive = !hasChildren && (item.destructive === true || item.id === "delete");
  const iconPaths = item.icon ? ICON_PATHS[item.icon] : undefined;
  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={onPick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 px-4 text-left text-base outline-hidden focus-visible:bg-accent active:bg-accent disabled:opacity-50",
        destructive && "text-destructive",
      )}
    >
      {iconPaths ? (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("size-5 shrink-0", !destructive && "text-muted-foreground")}
        >
          {iconPaths.map((node, index) => createElement(node.tag, { key: index, ...node.attrs }))}
        </svg>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.checked ? <CheckIcon className="size-5 shrink-0" /> : null}
      {hasChildren ? <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" /> : null}
    </button>
  );
}
