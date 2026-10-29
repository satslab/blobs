export type QuietThumb = "start" | "end";

const DAY = 24 * 60;
const SNAP = 30;

// The end thumb treats 00:00 as 24:00 so "until midnight" sits on the right edge; the bounds keep
// each thumb off the edge where its value would wrap and make it jump across the strip.
export const QUIET_BOUNDS = {
  start: { min: 0, max: DAY - SNAP },
  end: { min: SNAP, max: DAY },
} as const satisfies Record<QuietThumb, { min: number; max: number }>;

const clamp = (thumb: QuietThumb, minutes: number) =>
  Math.min(QUIET_BOUNDS[thumb].max, Math.max(QUIET_BOUNDS[thumb].min, minutes));

/** Strip position in minutes (0–1440) for a stored `HH:mm` value. */
export function quietPosition(thumb: QuietThumb, time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const minutes = hour * 60 + minute;
  return thumb === "end" && minutes === 0 ? DAY : minutes;
}

/** Display text for a strip position; 1440 reads as `24:00`. */
export function formatQuietPosition(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Stored `HH:mm` for a strip position; 1440 stores as `00:00`. */
export const quietTime = (minutes: number) => formatQuietPosition(minutes % DAY);

/** Snapped position for a pointer at `ratio` (0–1) across the strip. */
export const quietPositionAt = (thumb: QuietThumb, ratio: number) =>
  clamp(thumb, Math.round((ratio * DAY) / SNAP) * SNAP);

/** Moves to the next `step` grid line in `direction`, so off-grid values land on the grid. */
export function stepQuietPosition(
  thumb: QuietThumb,
  minutes: number,
  direction: 1 | -1,
  step = SNAP,
) {
  const next =
    direction > 0
      ? Math.floor(minutes / step) * step + step
      : Math.ceil(minutes / step) * step - step;
  return clamp(thumb, next);
}

/** Highlighted `[from, to]` spans; overnight ranges split at midnight and equal times are off. */
export function quietBands(start: number, end: number): ReadonlyArray<readonly [number, number]> {
  if (start % DAY === end % DAY) return [];
  return start < end
    ? [[start, end]]
    : [
        [start, DAY],
        [0, end],
      ];
}
