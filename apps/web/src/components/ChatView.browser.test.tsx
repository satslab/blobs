import { createMemoryHistory } from "@tanstack/react-router";
import { scopeProjectRef } from "@satslab/client-runtime/environment";
import {
  BotId,
  ThreadId,
  ORCHESTRATION_V2_WS_METHODS,
  type OrchestrationV2Command,
} from "@satslab/contracts";
import * as Effect from "effect/Effect";
import { DEFAULT_CLIENT_SETTINGS } from "@satslab/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform (React Compiler over ~4k lines)
// takes 6-11s; importing it here keeps that out of the test's timeout.
import "~/components/ChatView";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { usePromptStashStore } from "~/promptStashStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  PROJECT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return {
    ...actual,
    layer: Layer.succeed(actual.ConnectionDriver, {
      ...fakeDriver,
      connect: (entry: Parameters<FakeDriver["connect"]>[0]) =>
        fakeDriver.connect(entry).pipe(
          Effect.map((lease) => ({
            ...lease,
            session: {
              ...lease.session,
              client: new Proxy(lease.session.client, {
                get: (target, key) =>
                  key === ORCHESTRATION_V2_WS_METHODS.dispatchCommand
                    ? (command: OrchestrationV2Command) =>
                        Effect.sync(() => {
                          sendState.commands.push(command);
                          return { sequence: sendState.commands.length };
                        })
                    : Reflect.get(target, key),
              }),
            },
          })),
        ),
    }),
  };
});

const sendState = vi.hoisted(() => ({
  forceBusy: false,
  commands: [] as OrchestrationV2Command[],
}));
vi.mock(import("./chat/useLocalDispatchState"), async (original) => {
  const actual = await original();
  return {
    useLocalDispatchState: (input: Parameters<typeof actual.useLocalDispatchState>[0]) => {
      const result = actual.useLocalDispatchState(input);
      return { ...result, isSendBusy: sendState.forceBusy || result.isSendBusy };
    },
  };
});

vi.mock(import("~/composerHandleContext"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    useComposerHandleContext: () => {
      const ref = actual.useComposerHandleContext();
      return sendState.forceBusy ? null : ref;
    },
  };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it("a new draft does not load its reserved thread before the server lists it", async () => {
  using _environment = installFakeEnvironment([]);
  using fetchSpy = vi.spyOn(globalThis, "fetch");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const draftId = DraftId.make("draft-27443");
  const threadId = ThreadId.make("thread-27443");
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), draftId, { threadId });

  const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  // The shell snapshot has arrived once the sidebar lists the project, so the connection is up.
  await expect.element(page.getByText("render", { exact: true }).first()).toBeInTheDocument();

  const threadRequests = fetchSpy.mock.calls
    .map(([input]) => String(input instanceof Request ? input.url : input))
    .filter((url) => url.includes(`/api/orchestration/threads/${threadId}/`));
  // A 404 here marks the thread deleted, and the view never loads it once the send creates it.
  expect(threadRequests).toEqual([]);
});

it("clears a wrapped phone prompt without crashing", async () => {
  using _environment = installFakeEnvironment([]);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(390, 844);
  await using _viewport = {
    [Symbol.asyncDispose]: () => page.viewport(viewport.width, viewport.height),
  };
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const draftId = DraftId.make("draft-clear-wrapped-phone");
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), draftId, {
      threadId: ThreadId.make("thread-clear-wrapped-phone"),
    });
  const prompt = "This phone message wraps across several lines before it is sent. ".repeat(8);
  useComposerDraftStore.getState().setPrompt(draftId, prompt);
  const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
  await router.load();
  await using screen = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  const editor = screen.getByTestId("composer-editor");
  await expect.element(editor).toHaveTextContent(prompt.trim());
  await vi.waitFor(() =>
    expect(editor.element().closest("[data-composer-single-line]")).toBeNull(),
  );
  await act(() => useComposerDraftStore.getState().setPrompt(draftId, ""));
  await expect.element(editor).toBeVisible();
  await expect.element(editor).toHaveTextContent("");
  await act(() => useComposerDraftStore.getState().setPrompt(draftId, "Next message"));
  await expect.element(editor).toHaveTextContent("Next message");
});

it.each(["steer", "queue"] as const)("accepts %s while bot memory is preparing", async (mode) => {
  const fixture = threadWithHistory(`bot-preparing-${mode}`, 1);
  const running = fixture.runs[0]!;
  using _environment = installFakeEnvironment([
    {
      ...fixture,
      botId: BotId.make("preparing-memory"),
      runs: [{ ...running, status: "starting", startedAt: null, completedAt: null }],
    },
  ]);
  const commands: OrchestrationV2Command[] = [];
  sendState.commands = commands;
  sendState.forceBusy = true;
  using _busy = {
    [Symbol.dispose]: () => {
      sendState.forceBusy = false;
    },
  };
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    followUpBehavior: mode,
  });
  const ref = { environmentId: ENVIRONMENT_ID, threadId: fixture.id };
  useComposerDraftStore.getState().setPrompt(ref, "Use the new requirement");
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${fixture.id}`] }),
  );
  await router.load();
  await using screen = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  const editor = screen.getByTestId("composer-editor");
  await expect.element(editor).toHaveTextContent("Use the new requirement");
  await screen
    .getByRole("button", {
      name: mode === "steer" ? "Steer message" : "Queue message",
      exact: true,
    })
    .click();
  await vi.waitFor(() =>
    expect(commands).toContainEqual(
      expect.objectContaining({
        type: "message.dispatch",
        text: "Use the new requirement",
        ...(mode === "queue"
          ? { dispatchMode: { type: "queue_after_active" } }
          : { deliveryIntent: "steer" }),
      }),
    ),
  );
  await expect.element(editor).toHaveTextContent("");
});

it("stashes and restores a prompt in the bot workspace", async () => {
  const fixture = threadWithHistory("bot-stash", 1);
  using _environment = installFakeEnvironment([{ ...fixture, botId: BotId.make("stash-bot") }]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const ref = { environmentId: ENVIRONMENT_ID, threadId: fixture.id };
  useComposerDraftStore.getState().setPrompt(ref, "Save this bot prompt for later");
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/bots/${ENVIRONMENT_ID}/${fixture.id}`] }),
  );
  await router.load();
  await using screen = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  const editor = screen.getByTestId("composer-editor");
  await expect.element(editor).toHaveTextContent("Save this bot prompt for later");
  const stash = () =>
    act(() => {
      editor.element().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await stash();
  await expect.element(editor).toHaveTextContent("");
  expect(usePromptStashStore.getState().entries).toEqual(
    expect.arrayContaining([expect.objectContaining({ prompt: "Save this bot prompt for later" })]),
  );
  await stash();
  await expect.element(editor).toHaveTextContent("Save this bot prompt for later");
});
