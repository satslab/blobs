import type { RouterHistory } from "@tanstack/react-router";
import { ensureClientSettingsHydrated, getClientSettings } from "../../hooks/useSettings";

function botStartupPath(pathname: string, alternateLayoutEnabled: boolean) {
  if (pathname === "/layout" || pathname === "/layout/") return "/layout/bot";
  return pathname === "/" && alternateLayoutEnabled ? "/bots" : null;
}

export async function prepareBotStartup(history: RouterHistory) {
  const initialHref = history.location.href;
  if (!["/", "/layout", "/layout/"].includes(history.location.pathname)) return;
  await ensureClientSettingsHydrated().catch(() => undefined);
  if (history.location.href !== initialHref) return;
  const settings = getClientSettings();
  // Keep the home route available until the first-run gate has resolved onboarding.
  if (settings.onboardingCompletedAt === null) return;
  const pathname = botStartupPath(history.location.pathname, settings.alternateLayoutEnabled);
  if (pathname) history.replace(`${pathname}${history.location.search}${history.location.hash}`);
}
