import { ChevronDownIcon, PaperclipIcon } from "lucide-react";

import { use } from "react";

import { createPortal } from "react-dom";

import { cn } from "~/lib/utils";
import { MobileShellContext, useScrollToEndSlot } from "../mobile/mobileLayout";
import { Button } from "../ui/button";

export function WorkspaceFileDropOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-primary/[0.035]"
      data-chat-workspace-drop-overlay="true"
    >
      <div
        role="status"
        className="flex items-center gap-2 rounded-full border border-primary/25 bg-background/95 px-4 py-2.5 text-sm font-medium text-foreground shadow-lg"
      >
        <PaperclipIcon className="size-4 text-primary" aria-hidden="true" />
        Drop files to attach
      </div>
    </div>
  );
}

/**
 * Sits `bottom` pixels up, clear of the composer and its attached banners. The summary names
 * what waits at the end of the timeline, which is out of view while it shows.
 */
export function ScrollToEndButton(props: {
  readonly bottom: number;
  readonly summary: string | null;
  readonly onScrollToEnd: () => void;
}) {
  const inMobileShell = use(MobileShellContext);
  const noticeSlot = useScrollToEndSlot();
  // The phone layout's control is a round glass button, as on the mobile app. Beside a notice
  // capsule it joins that row; alone it centers over the composer.
  const mobileButton = (
    <button
      type="button"
      data-scroll-to-end="true"
      aria-label="Scroll to end"
      onPointerDown={(event) => event.preventDefault()}
      onClick={props.onScrollToEnd}
      className="glass-float pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <ChevronDownIcon className="size-5" />
    </button>
  );
  if (inMobileShell && noticeSlot) return createPortal(mobileButton, noticeSlot);
  return (
    <div
      className={cn(
        "chat-scroll-to-bottom pointer-events-none absolute z-30 flex justify-center",
        !inMobileShell && "py-1.5",
      )}
      // The phone button sits 8px over the composer, as on the mobile app.
      style={{ bottom: inMobileShell ? props.bottom - 10 : props.bottom }}
    >
      {inMobileShell ? (
        mobileButton
      ) : (
        <Button
          data-scroll-to-end="true"
          onPointerDown={(event) => event.preventDefault()}
          onClick={props.onScrollToEnd}
          className="pointer-events-auto"
          size="xs"
          variant="glass"
        >
          <ChevronDownIcon className="size-3.5" />
          Scroll to end
          {props.summary === null ? null : (
            <span className="text-muted-foreground">
              <span aria-hidden>· </span>
              {props.summary}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
