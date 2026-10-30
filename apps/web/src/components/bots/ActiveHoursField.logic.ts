export type ActiveThumb = "start" | "end";

const DAY = 24 * 60;
const SNAP = 30;

// The end thumb treats 00:00 as 24:00 so "until midnight" sits on the right edge; the bounds keep
// each thumb off the edge where its value would wrap and make it jump across the strip.
export const ACTIVE_BOUNDS = {
  start: { min: 0, max: DAY - SNAP },
  end: { min: SNAP, max: DAY },
} as const satisfies Record<ActiveThumb, { min: number; max: number }>;

const clamp = (thumb: ActiveThumb, minutes: number) =>
  Math.min(ACTIVE_BOUNDS[thumb].max, Math.max(ACTIVE_BOUNDS[thumb].min, minutes));

/** Both boundaries on the same minute mean a full day. */
export const activeAllDay = (start: number, end: number) => start % DAY === end % DAY;

/** Strip position in minutes (0–1440) for a stored `HH:mm` boundary. */
export function activePosition(thumb: ActiveThumb, time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const minutes = hour * 60 + minute;
  return thumb === "end" && minutes === 0 ? DAY : minutes;
}

/** Display text for a strip position; 1440 reads as `24:00`. */
export function formatActivePosition(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Stored `HH:mm` for a strip position; 1440 stores as `00:00`. */
export const activeTime = (minutes: number) => formatActivePosition(minutes % DAY);

/** Keeps a moving thumb off the other one so equal boundaries only ever mean a full day. */
const stepPast = (minutes: number, other: number, direction: 1 | -1, step = SNAP) =>
  activeAllDay(minutes, other) ? minutes + direction * step : minutes;

/** Snapped position for a pointer at `ratio` (0–1) across the strip. */
export function activePositionAt(
  thumb: ActiveThumb,
  ratio: number,
  current: number,
  other: number,
) {
  const at = clamp(thumb, Math.round((ratio * DAY) / SNAP) * SNAP);
  return clamp(thumb, stepPast(at, other, at >= current ? 1 : -1));
}

/** Moves to the next `step` grid line in `direction`, so off-grid values land on the grid. */
export function stepActivePosition(
  thumb: ActiveThumb,
  minutes: number,
  direction: 1 | -1,
  other: number,
  step = SNAP,
) {
  const next =
    direction > 0
      ? Math.floor(minutes / step) * step + step
      : Math.ceil(minutes / step) * step - step;
  return clamp(thumb, stepPast(next, other, direction, step));
}

/** Highlighted `[from, to]` spans of active hours; overnight ranges split at midnight. */
export function activeBands(start: number, end: number): ReadonlyArray<readonly [number, number]> {
  if (activeAllDay(start, end)) return [[0, DAY]];
  return start < end
    ? [[start, end]]
    : [
        [start, DAY],
        [0, end],
      ];
}
