import { useRef, type TouchEvent } from "react";

// Dragging the title down further than this, or flicking faster (px per ms), dismisses the sheet.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.5;

/**
 * Lets a sheet's title area drag the sheet down, following the finger, to dismiss it. The sheet is
 * the closest sheet popup, or an element marked `data-sheet-drag` (phone popovers shown as sheets).
 */
export function useDragToDismiss(onDismiss: (sheet: HTMLElement) => void) {
  const drag = useRef<{
    popup: HTMLElement;
    startY: number;
    offset: number;
    lastY: number;
    lastTime: number;
    velocity: number;
  } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    const popup = event.currentTarget.closest<HTMLElement>(
      "[data-slot=sheet-popup],[data-sheet-drag]",
    );
    if (!touch || !popup) return;
    drag.current = {
      popup,
      startY: touch.clientY,
      offset: 0,
      lastY: touch.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  };
  const onTouchMove = (event: TouchEvent) => {
    const state = drag.current;
    const touch = event.touches[0];
    if (!state || !touch) return;
    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.velocity = (touch.clientY - state.lastY) / elapsed;
    state.lastY = touch.clientY;
    state.lastTime = event.timeStamp;
    state.offset = Math.max(0, touch.clientY - state.startY);
    state.popup.style.transition = "none";
    state.popup.style.translate = `0 ${state.offset}px`;
  };
  const onTouchEnd = () => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.offset === 0) return;
    const dismiss = state.velocity > DISMISS_VELOCITY || state.offset > DISMISS_DISTANCE;
    const { popup } = state;
    popup.style.transition = "translate 200ms ease-out";
    popup.style.translate = dismiss ? "0 100%" : "0 0";
    popup.addEventListener(
      "transitionend",
      () => {
        popup.style.transition = "";
        if (dismiss) onDismiss(popup);
        else popup.style.translate = "";
      },
      { once: true },
    );
  };
  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd };
}
