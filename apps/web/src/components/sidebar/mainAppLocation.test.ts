import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRouter,
} from "@tanstack/react-router";
import { expect, it, vi } from "vite-plus/test";

function createAppRouter(initialEntry: string) {
  const root = createRootRoute();
  return createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/" }),
      createRoute({ getParentRoute: () => root, path: "/$environmentId/$threadId" }),
      createRoute({ getParentRoute: () => root, path: "/bots" }),
      createRoute({ getParentRoute: () => root, path: "/bots/$environmentId/$threadId" }),
      createRoute({ getParentRoute: () => root, path: "/bots/settings/$environmentId/$botId" }),
      createRoute({ getParentRoute: () => root, path: "/settings" }),
      createRoute({ getParentRoute: () => root, path: "/projects/$projectKey" }),
      createRoute({ getParentRoute: () => root, path: "/pull-requests" }),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

async function startTracking(initialEntry: string) {
  vi.resetModules();
  const { navigateToThreads, startMainAppLocationTracking } = await import("./mainAppLocation");
  const router = createAppRouter(initialEntry);
  startMainAppLocationTracking(router);
  await router.load();
  return { router, navigateToThreads };
}

// RouterProvider emits this once a navigation's matches finish loading.
function completeNavigation(router: AnyRouter) {
  const location = router.state.location;
  router.emit({
    type: "onResolved",
    toLocation: location,
    pathChanged: true,
    hrefChanged: true,
    hashChanged: false,
  });
}

it("keeps dedicated bot settings from replacing the remembered conversation", async () => {
  vi.resetModules();
  const { isSidebarUtilityPage } = await import("./mainAppLocation");
  expect(isSidebarUtilityPage("/bots/settings/environment/bot")).toBe(true);
  expect(isSidebarUtilityPage("/bots/environment/root")).toBe(false);
  expect(isSidebarUtilityPage("/bots/environment/subagent")).toBe(false);
  expect(isSidebarUtilityPage("/bots")).toBe(false);
});

it("returns from bots to the thread that was open before", async () => {
  const { router, navigateToThreads } = await startTracking("/");
  await router.navigate({ href: "/environment-one/thread-one" });
  completeNavigation(router);
  await router.navigate({ href: "/bots/environment-one/bot-one" });
  completeNavigation(router);

  await navigateToThreads(router);

  expect(router.state.location.pathname).toBe("/environment-one/thread-one");
});

it("keeps the thread target through settings and utility pages", async () => {
  const { router, navigateToThreads } = await startTracking("/environment-one/thread-one");
  for (const href of [
    "/settings",
    "/projects/repo",
    "/pull-requests",
    "/bots/settings/environment-one/bot-one",
  ]) {
    await router.navigate({ href });
    completeNavigation(router);
  }

  await navigateToThreads(router);

  expect(router.state.location.pathname).toBe("/environment-one/thread-one");
});

it("falls back to the home page when no thread was visited before bots", async () => {
  const { router, navigateToThreads } = await startTracking("/bots");

  await navigateToThreads(router);

  expect(router.state.location.pathname).toBe("/");
});
