import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "../../lib/utils";
import {
  QUIET_BOUNDS,
  formatQuietPosition,
  quietBands,
  quietPosition,
  quietPositionAt,
  quietTime,
  stepQuietPosition,
  type QuietThumb,
} from "./QuietHoursField.logic";

type Preview = { thumb: QuietThumb; minutes: number };

const THUMBS = ["start", "end"] as const;
const TICKS = ["00", "06", "12", "18", "24"];
const percent = (minutes: number) => `${(minutes / 1440) * 100}%`;

/**
 * Quiet hours as a 24-hour strip with a start and an end thumb. Drags and held keys preview
 * locally and save once on release; Escape or a cancelled pointer restores the saved value.
 */
export function QuietHoursField({
  id,
  start,
  end,
  disabled,
  onChange,
}: {
  id: string;
  start: string;
  end: string;
  disabled: boolean;
  onChange: (patch: { quietStart: string } | { quietEnd: string }) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const thumbs = useRef<Record<QuietThumb, HTMLDivElement | null>>({ start: null, end: null });
  const drag = useRef<{ pointerId: number; thumb: QuietThumb } | null>(null);
  const pending = useRef<Preview | null>(null);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const saved = { start, end };

  function setPreview(next: Preview | null) {
    pending.current = next;
    setPreviewState(next);
  }

  function commit() {
    const next = pending.current;
    setPreview(null);
    if (next === null) return;
    const time = quietTime(next.minutes);
    if (time === saved[next.thumb]) return;
    onChange(next.thumb === "start" ? { quietStart: time } : { quietEnd: time });
  }

  function cancelDrag() {
    const active = drag.current;
    drag.current = null;
    if (active && track.current?.hasPointerCapture(active.pointerId)) {
      track.current.releasePointerCapture(active.pointerId);
    }
    setPreview(null);
  }

  const position = (thumb: QuietThumb) =>
    preview?.thumb === thumb ? preview.minutes : quietPosition(thumb, saved[thumb]);
  const positions = { start: position("start"), end: position("end") };
  const bands = quietBands(positions.start, positions.end);

  function ratioAt(event: PointerEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || drag.current || event.button !== 0) return;
    event.preventDefault();
    const target = event.target instanceof HTMLElement ? event.target.dataset.thumb : undefined;
    const ratio = ratioAt(event);
    const thumb: QuietThumb =
      target === "start" || target === "end"
        ? target
        : Math.abs(ratio * 1440 - positions.start) < Math.abs(ratio * 1440 - positions.end)
          ? "start"
          : "end";
    commit();
    drag.current = { pointerId: event.pointerId, thumb };
    event.currentTarget.setPointerCapture(event.pointerId);
    thumbs.current[thumb]?.focus();
    // Pressing a thumb keeps an off-grid value until it moves; pressing the track jumps there.
    if (target !== thumb) setPreview({ thumb, minutes: quietPositionAt(thumb, ratio) });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    setPreview({ thumb: active.thumb, minutes: quietPositionAt(active.thumb, ratioAt(event)) });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    commit();
  }

  function onKeyDown(thumb: QuietThumb, event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (drag.current || pending.current) event.preventDefault();
      cancelDrag();
      return;
    }
    if (disabled || drag.current) return;
    const current = position(thumb);
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? stepQuietPosition(thumb, current, 1)
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? stepQuietPosition(thumb, current, -1)
          : event.key === "PageUp"
            ? stepQuietPosition(thumb, current, 1, 60)
            : event.key === "PageDown"
              ? stepQuietPosition(thumb, current, -1, 60)
              : event.key === "Home"
                ? QUIET_BOUNDS[thumb].min
                : event.key === "End"
                  ? QUIET_BOUNDS[thumb].max
                  : null;
    if (next === null) return;
    event.preventDefault();
    setPreview({ thumb, minutes: next });
  }

  const off = bands.length === 0;
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span id={`${id}-label`} className="min-w-0 truncate text-sm">
          Quiet hours
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {off
            ? "Off"
            : `${formatQuietPosition(positions.start)} – ${formatQuietPosition(positions.end)}`}
        </span>
      </div>
      <div className={cn(disabled && "opacity-64")}>
        <div
          ref={track}
          className={cn(
            "relative h-6 touch-none rounded-md bg-border/50",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={() => {
            if (drag.current) cancelDrag();
          }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-md">
            {bands.map(([from, to]) => (
              <div
                key={from}
                className="absolute inset-y-0 bg-primary/30"
                style={{ left: percent(from), width: percent(to - from) }}
              />
            ))}
          </div>
          {THUMBS.map((thumb) => (
            <div
              key={thumb}
              ref={(node) => {
                thumbs.current[thumb] = node;
              }}
              id={thumb === "start" ? id : undefined}
              data-thumb={thumb}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={thumb === "start" ? "Quiet hours start" : "Quiet hours end"}
              aria-valuemin={Math.min(QUIET_BOUNDS[thumb].min, positions[thumb])}
              aria-valuemax={Math.max(QUIET_BOUNDS[thumb].max, positions[thumb])}
              aria-valuenow={positions[thumb]}
              aria-valuetext={formatQuietPosition(positions[thumb])}
              aria-orientation="horizontal"
              aria-disabled={disabled || undefined}
              className={cn(
                "absolute -top-0.5 -ml-[5px] h-7 w-2.5 rounded-sm border-2 border-card bg-primary outline-none focus-visible:border-ring",
                !disabled && "cursor-ew-resize",
              )}
              style={{ left: percent(positions[thumb]) }}
              onKeyDown={(event) => onKeyDown(thumb, event)}
              onKeyUp={() => {
                if (!drag.current) commit();
              }}
              onBlur={() => {
                if (!drag.current) commit();
              }}
            />
          ))}
        </div>
        <div
          aria-hidden
          className="mt-1 flex justify-between text-3xs text-muted-foreground tabular-nums"
        >
          {TICKS.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
