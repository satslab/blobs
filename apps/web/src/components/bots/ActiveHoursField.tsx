import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "../../lib/utils";
import {
  ACTIVE_BOUNDS,
  activeAllDay,
  activeBands,
  activePosition,
  activePositionAt,
  activeTime,
  formatActivePosition,
  stepActivePosition,
  type ActiveThumb,
} from "./ActiveHoursField.logic";

type Preview = { thumb: ActiveThumb; minutes: number };

const THUMBS = ["start", "end"] as const;
const TICKS = ["00", "06", "12", "18", "24"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const percent = (minutes: number) => `${(minutes / 1440) * 100}%`;

/**
 * Active hours as a 24-hour strip with a start and an end thumb, plus the weekdays check-ins may
 * run on. Drags and held keys preview locally and save once on release; Escape or a cancelled
 * pointer restores the saved value.
 */
export function ActiveHoursField({
  id,
  start,
  end,
  days,
  disabled,
  onHoursChange,
  onDaysChange,
}: {
  id: string;
  /** Active start and end as `HH:mm`; equal values mean a full day. */
  start: string;
  end: string;
  /** Selected weekdays, 0 is Sunday. */
  days: readonly number[];
  disabled: boolean;
  onHoursChange: (start: string, end: string) => void;
  onDaysChange: (days: readonly number[]) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const thumbs = useRef<Record<ActiveThumb, HTMLDivElement | null>>({ start: null, end: null });
  const drag = useRef<{ pointerId: number; thumb: ActiveThumb } | null>(null);
  const pending = useRef<Preview | null>(null);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const stored = { start: activePosition("start", start), end: activePosition("end", end) };
  // A full day is drawn on the edges so the two thumbs never collapse onto one interior point.
  const saved = activeAllDay(stored.start, stored.end)
    ? { start: ACTIVE_BOUNDS.start.min, end: ACTIVE_BOUNDS.end.max }
    : stored;

  function setPreview(next: Preview | null) {
    pending.current = next;
    setPreviewState(next);
  }

  function commit() {
    const next = pending.current;
    setPreview(null);
    if (next === null || next.minutes === saved[next.thumb]) return;
    const positions = { ...saved, [next.thumb]: next.minutes };
    onHoursChange(activeTime(positions.start), activeTime(positions.end));
  }

  function cancelDrag() {
    const active = drag.current;
    drag.current = null;
    if (active && track.current?.hasPointerCapture(active.pointerId)) {
      track.current.releasePointerCapture(active.pointerId);
    }
    setPreview(null);
  }

  const position = (thumb: ActiveThumb) =>
    preview?.thumb === thumb ? preview.minutes : saved[thumb];
  const positions = { start: position("start"), end: position("end") };
  const other = (thumb: ActiveThumb) => positions[thumb === "start" ? "end" : "start"];
  const bands = activeBands(positions.start, positions.end);

  function ratioAt(event: PointerEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || drag.current || event.button !== 0) return;
    event.preventDefault();
    const target = event.target instanceof HTMLElement ? event.target.dataset.thumb : undefined;
    const ratio = ratioAt(event);
    const thumb: ActiveThumb =
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
    if (target !== thumb)
      setPreview({
        thumb,
        minutes: activePositionAt(thumb, ratio, positions[thumb], other(thumb)),
      });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    setPreview({
      thumb: active.thumb,
      minutes: activePositionAt(
        active.thumb,
        ratioAt(event),
        positions[active.thumb],
        other(active.thumb),
      ),
    });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    commit();
  }

  function onKeyDown(thumb: ActiveThumb, event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (drag.current || pending.current) event.preventDefault();
      cancelDrag();
      return;
    }
    if (disabled || drag.current) return;
    const current = position(thumb);
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? stepActivePosition(thumb, current, 1, other(thumb))
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? stepActivePosition(thumb, current, -1, other(thumb))
          : event.key === "PageUp"
            ? stepActivePosition(thumb, current, 1, other(thumb), 60)
            : event.key === "PageDown"
              ? stepActivePosition(thumb, current, -1, other(thumb), 60)
              : event.key === "Home"
                ? ACTIVE_BOUNDS[thumb].min
                : event.key === "End"
                  ? ACTIVE_BOUNDS[thumb].max
                  : null;
    if (next === null) return;
    event.preventDefault();
    setPreview({ thumb, minutes: next });
  }

  const allDay = activeAllDay(positions.start, positions.end);
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span id={`${id}-label`} className="min-w-0 truncate text-sm">
          Active hours
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {allDay
            ? "All day"
            : `${formatActivePosition(positions.start)} – ${formatActivePosition(positions.end)}`}
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
              aria-label={thumb === "start" ? "Active hours start" : "Active hours end"}
              aria-valuemin={Math.min(ACTIVE_BOUNDS[thumb].min, positions[thumb])}
              aria-valuemax={Math.max(ACTIVE_BOUNDS[thumb].max, positions[thumb])}
              aria-valuenow={positions[thumb]}
              aria-valuetext={formatActivePosition(positions[thumb])}
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
        <div
          role="group"
          aria-label="Active days"
          className="mt-1.5 flex items-center justify-between"
        >
          {WEEKDAYS.map((name, day) => {
            const on = days.includes(day);
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={on}
                disabled={disabled}
                onClick={() =>
                  onDaysChange(
                    on
                      ? days.filter((value) => value !== day)
                      : [...days, day].toSorted((a, b) => a - b),
                  )
                }
                className={cn(
                  "size-6 shrink-0 rounded-full border text-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed",
                  on
                    ? "border-primary bg-primary/30 text-foreground"
                    : "border-border/60 text-muted-foreground enabled:hover:border-ring",
                )}
              >
                {name[0]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
