import { useSyncExternalStore } from "react";

import { isElectron } from "../env";
import { isMacPlatform } from "../lib/utils";

// Cache the synchronous fullscreen IPC read until subscription.
let windowFullscreenSnapshot: boolean | null = null;

function macosDesktopBridge() {
  if (!isElectron || !isMacPlatform(navigator.platform)) return null;
  return window.desktopBridge ?? null;
}

function subscribeToWindowFullscreen(onChange: () => void): () => void {
  const bridge = macosDesktopBridge();
  if (
    typeof bridge?.getWindowFullscreenState !== "function" ||
    typeof bridge.onWindowFullscreenStateChange !== "function"
  ) {
    return () => {};
  }
  const unsubscribe = bridge.onWindowFullscreenStateChange((fullscreen) => {
    windowFullscreenSnapshot = fullscreen;
    onChange();
  });
  // The window may have changed state between the first render and this subscription.
  windowFullscreenSnapshot = bridge.getWindowFullscreenState();
  return () => {
    unsubscribe();
    windowFullscreenSnapshot = null;
  };
}

function readWindowFullscreen(): boolean {
  if (windowFullscreenSnapshot === null) {
    const getWindowFullscreenState = macosDesktopBridge()?.getWindowFullscreenState;
    windowFullscreenSnapshot =
      typeof getWindowFullscreenState === "function" ? getWindowFullscreenState() : false;
  }
  return windowFullscreenSnapshot;
}

/**
 * How far the macOS traffic lights reach into the window, or null where there are none: off
 * the macOS desktop app, or in fullscreen.
 */
export function useMacosWindowControlsInset(): string | null {
  const fullscreen = useSyncExternalStore(subscribeToWindowFullscreen, readWindowFullscreen);
  if (!isElectron || !isMacPlatform(navigator.platform) || fullscreen) return null;
  return "var(--desktop-window-controls-inset, 90px)";
}
