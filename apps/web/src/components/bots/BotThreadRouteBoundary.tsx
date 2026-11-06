import type { ScopedThreadRef } from "@satslab/contracts";
import { Navigate, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useOpenServerThreadBotContext } from "../../state/bots";
import { isThreadRoutePathname } from "../../threadRoutes";

export function BotThreadRouteBoundary({
  threadRef,
  children,
}: {
  threadRef: ScopedThreadRef | null;
  children: ReactNode;
}) {
  const bot = useOpenServerThreadBotContext(threadRef);
  const pathname = useLocation({
    // Thread ids may hold reserved characters, so compare decoded segments.
    select: (location) =>
      location.pathname
        .replace(/^\/layout(?=\/|$)/, "")
        .split("/")
        .map(decodeURIComponent)
        .join("/") || "/",
  });
  // Old bookmarks and app-owned thread links still use ordinary thread URLs.
  if (
    threadRef &&
    bot &&
    !pathname.startsWith("/bots/") &&
    isThreadRoutePathname(pathname, threadRef)
  ) {
    return <Navigate to="/bots/$environmentId/$threadId" params={threadRef} search hash replace />;
  }
  return children;
}
