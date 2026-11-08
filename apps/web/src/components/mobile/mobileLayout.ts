import { createContext, use, useSyncExternalStore } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";

/** Below `sm` the app swaps its frame for the mobile shell. */
export function useMobileLayout() {
  return useMediaQuery("max-sm");
}

/**
 * Where a sidebar list renders inside the mobile shell, so it can drop the desktop chrome the
 * shell replaces. `null` outside the shell.
 */
export type MobileSidebarPresentation = "drawer" | null;

export const MobileSidebarPresentationContext = createContext<MobileSidebarPresentation>(null);

export function useMobileSidebarPresentation() {
  return use(MobileSidebarPresentationContext);
}

/** True inside the mobile shell, whose header replaces the chat's own. */
export const MobileShellContext = createContext(false);

// A keyboard shrinks the visual viewport by at least this much.
const KEYBOARD_THRESHOLD = 150;

/**
 * Keeps a fixed element inside the visual viewport, which shrinks and scrolls while a keyboard is
 * open, and marks it `data-keyboard-open` meanwhile. The element fills the viewport from `top`
 * down; `layoutTop` is where its layout already puts it. Returns the cleanup.
 */
export function followVisualViewport(element: HTMLElement, top = 0, layoutTop = 0) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  // iOS shrinks innerHeight with the keyboard too, so compare with the tallest height seen.
  let fullHeight = viewport.height;
  let width = viewport.width;
  const update = () => {
    if (viewport.width !== width) {
      width = viewport.width;
      fullHeight = viewport.height;
    }
    fullHeight = Math.max(fullHeight, viewport.height);
    element.style.height = `${viewport.height - top}px`;
    element.style.transform = `translateY(${viewport.offsetTop + top - layoutTop}px)`;
    element.toggleAttribute(
      "data-keyboard-open",
      fullHeight - viewport.height > KEYBOARD_THRESHOLD,
    );
  };
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}

/**
 * Publishes the visible screen's height and bottom edge, in layout pixels, as `--vv-height` and
 * `--vv-bottom` on the root, so popups portaled outside the frame can sit above a keyboard.
 * Returns the cleanup.
 */
export function publishVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement.style;
  const update = () => {
    root.setProperty("--vv-height", `${viewport.height}px`);
    root.setProperty("--vv-bottom", `${viewport.offsetTop + viewport.height}px`);
  };
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    root.removeProperty("--vv-height");
    root.removeProperty("--vv-bottom");
  };
}

// The phone notice row's slot for the scroll-to-end button, which the chat view renders apart from
// the composer that owns the row.
let scrollToEndSlot: HTMLElement | null = null;
const scrollToEndSlotListeners = new Set<() => void>();

/** Ref callback for the slot beside the phone notice capsule. */
export function registerScrollToEndSlot(element: HTMLElement | null): (() => void) | undefined {
  const publish = (next: HTMLElement | null) => {
    scrollToEndSlot = next;
    for (const listener of scrollToEndSlotListeners) listener();
  };
  publish(element);
  return element ? () => publish(null) : undefined;
}

/** The slot beside the phone notice capsule, while one shows. */
export function useScrollToEndSlot() {
  return useSyncExternalStore(
    (listener) => {
      scrollToEndSlotListeners.add(listener);
      return () => scrollToEndSlotListeners.delete(listener);
    },
    () => scrollToEndSlot,
    () => null,
  );
}
