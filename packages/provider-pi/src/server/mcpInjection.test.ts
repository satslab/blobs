import { assert, describe, expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@satslab/contracts";

import {
  BLOBS_MCP_BEARER_ENV,
  BLOBS_MCP_URL_ENV,
  BLOBS_PI_RUNTIME_MODE_ENV,
  BLOBS_PI_MEMORY_CHAT_ENV,
  BLOBS_PI_MCP_EXTENSION_PATH_ENV,
} from "./mcpExtensionSource.ts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as NodePath from "effect/Path";
import * as NodeFS from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  buildPiRpcLaunch,
  materializePiT3McpExtension,
  piBotLaunchArgs,
  resolvePiLaunchArgs,
  withoutPiPromptResources,
} from "./mcpInjection.ts";
import { PI_BLOBS_MCP_EXTENSION_SOURCE } from "./mcpExtensionSource.ts";

const threadId = ThreadId.make("thread-pi-t3-mcp");

const mcpSession = {
  environmentId: EnvironmentId.make("environment-pi-t3-mcp"),
  threadId,
  providerSessionId: "mcp-session-pi",
  providerInstanceId: ProviderInstanceId.make("pi"),
  endpoint: "http://127.0.0.1:43123/mcp",
  authorizationHeader: "Bearer secret-pi-token",
  browserToolsAvailable: true,
};

describe("pi T3 MCP injection", () => {
  it("keeps native tools and coding instructions for workers with inherited memory", () => {
    const launch = buildPiRpcLaunch({
      launchArgs: [],
      environment: { [BLOBS_PI_MEMORY_CHAT_ENV]: "1" },
      mcpSession: {
        ...mcpSession,
        endpoint: "http://127.0.0.1:43123/bot-mcp",
        botRunId: RunId.make("parent-turn"),
        botThreadId: ThreadId.make("parent"),
      },
      extensionPath: "/tmp/cache/pi-blobs-mcp-extension.ts",
    });
    assert.equal(launch.env[BLOBS_MCP_URL_ENV], "http://127.0.0.1:43123/bot-mcp");
    assert.isUndefined(launch.env[BLOBS_PI_MEMORY_CHAT_ENV]);
    assert.notInclude(launch.args, "--no-tools");
    assert.notInclude(launch.args, "--no-extensions");
  });

  it("always adds the permission bridge and configures MCP when available", () => {
    const resolvedArgs = resolvePiLaunchArgs(
      "--extension=/home/user/.pi/agent/extensions/demo.ts --session-dir=/tmp/pi-sessions --provider=anthropic --model=claude-sonnet --tools='' --name=-review --extension-flag=kept",
    );
    assert.isTrue(resolvedArgs.ok);
    if (!resolvedArgs.ok) return;
    const launch = buildPiRpcLaunch({
      launchArgs: resolvedArgs.args,
      environment: { PATH: "/usr/bin" },
      mcpSession,
      extensionPath: "/tmp/cache/pi-blobs-mcp-extension.ts",
      runtimeMode: "approval-required",
    });
    assert.deepEqual(launch.args, [
      "--mode",
      "rpc",
      "--extension",
      "/home/user/.pi/agent/extensions/demo.ts",
      "--session-dir",
      "/tmp/pi-sessions",
      "--provider",
      "anthropic",
      "--model",
      "claude-sonnet",
      "--tools",
      "",
      "--name",
      "-review",
      "--extension-flag=kept",
      "--extension",
      "/tmp/cache/pi-blobs-mcp-extension.ts",
    ]);
    assert.notInclude(launch.args, "--no-extensions");
    assert.equal(launch.env[BLOBS_MCP_URL_ENV], "http://127.0.0.1:43123/mcp");
    assert.equal(launch.env[BLOBS_MCP_BEARER_ENV], "secret-pi-token");
    assert.equal(launch.env[BLOBS_PI_RUNTIME_MODE_ENV], "approval-required");
    assert.equal(
      launch.env[BLOBS_PI_MCP_EXTENSION_PATH_ENV],
      "/tmp/cache/pi-blobs-mcp-extension.ts",
    );

    const permissionOnly = buildPiRpcLaunch({
      launchArgs: [],
      environment: {
        [BLOBS_MCP_URL_ENV]: "http://127.0.0.1:9999/stale",
        [BLOBS_MCP_BEARER_ENV]: "stale-token",
        [BLOBS_PI_MCP_EXTENSION_PATH_ENV]: "/stale/extension.ts",
      },
      mcpSession: undefined,
      extensionPath: "/tmp/cache/pi-blobs-mcp-extension.ts",
      runtimeMode: "auto-accept-edits",
    });
    assert.deepEqual(permissionOnly.args, [
      "--mode",
      "rpc",
      "--extension",
      "/tmp/cache/pi-blobs-mcp-extension.ts",
    ]);
    assert.isUndefined(permissionOnly.env[BLOBS_MCP_URL_ENV]);
    assert.isUndefined(permissionOnly.env[BLOBS_MCP_BEARER_ENV]);
    assert.equal(permissionOnly.env[BLOBS_PI_RUNTIME_MODE_ENV], "auto-accept-edits");
    assert.equal(
      permissionOnly.env[BLOBS_PI_MCP_EXTENSION_PATH_ENV],
      "/tmp/cache/pi-blobs-mcp-extension.ts",
    );
  });

  it("forces tools and user extensions off for unattended text generation", () => {
    const launch = buildPiRpcLaunch({
      launchArgs: [
        "--tools",
        "read,write",
        "--extension",
        "/home/user/.pi/agent/extensions/demo.ts",
        "--extension=./second.ts",
        "--provider",
        "anthropic",
      ],
      environment: {},
      mcpSession,
      extensionPath: "/tmp/cache/pi-blobs-mcp-extension.ts",
      sessionPath: "/fake/persisted.jsonl",
      ephemeral: true,
      shortLived: true,
      disableExtensions: true,
      disableTools: true,
    });
    assert.deepEqual(launch.args, [
      "--mode",
      "rpc",
      "--no-session",
      "--provider",
      "anthropic",
      "--offline",
      "--no-extensions",
      "--no-tools",
    ]);
    const alreadyOffline = buildPiRpcLaunch({
      launchArgs: ["--offline"],
      environment: {},
      mcpSession: undefined,
      extensionPath: undefined,
      ephemeral: true,
      shortLived: true,
    });
    assert.deepEqual(alreadyOffline.args, ["--mode", "rpc", "--no-session", "--offline"]);
    assert.deepInclude(resolvePiLaunchArgs("--mode text"), {
      ok: false,
      message: "Pi launch argument '--mode' is controlled by Blobs and cannot be overridden.",
    });
    assert.deepInclude(resolvePiLaunchArgs("--session old.jsonl"), { ok: false });
    assert.deepInclude(resolvePiLaunchArgs("prompt pi immediately"), { ok: false });
    assert.deepInclude(resolvePiLaunchArgs("--plan @instructions.md"), { ok: false });
  });

  it("rejects --provider without --model, which Pi 1.0 refuses at startup", () => {
    const rejection = {
      ok: false,
      message: "Pi launch argument '--provider' requires '--model'.",
    };
    assert.deepInclude(resolvePiLaunchArgs("--provider openrouter"), rejection);
    assert.deepInclude(resolvePiLaunchArgs("--provider=openrouter --models gpt-6"), rejection);
    assert.isTrue(resolvePiLaunchArgs("--provider openrouter --model=deepseek/v4").ok);
    assert.isTrue(resolvePiLaunchArgs("--model deepseek/v4").ok);
  });
});

describe("materializePiT3McpExtension", () => {
  // A pi launch concurrent with the materialize reads the extension file from
  // disk; a truncate-then-write exposes an empty or partial file mid-write and
  // the launch loads a broken extension.
  it.live("never exposes a torn extension file to a concurrent reader", () =>
    Effect.gen(function* () {
      const fs = yield* NodeFS.FileSystem;
      const path = yield* NodePath.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pi-atomic-" });
      const anomalies: Array<string> = [];
      const stopAfter = 120;
      const writer = yield* Effect.forkChild(
        Effect.gen(function* () {
          for (let index = 0; index < stopAfter; index += 1) {
            yield* fs
              .remove(path.join(directory, "pi-t3-mcp-extension.ts"), { force: true })
              .pipe(Effect.ignore);
            yield* Effect.all(
              [materializePiT3McpExtension(directory), materializePiT3McpExtension(directory)],
              { concurrency: "unbounded" },
            );
          }
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
      const reader = yield* Effect.forkChild(
        Effect.forever(
          Effect.gen(function* () {
            const text = yield* fs
              .readFileString(path.join(directory, "pi-t3-mcp-extension.ts"))
              .pipe(Effect.option);
            if (Option.isNone(text)) return; // Missing between writes: legitimate.
            // A read that SUCCEEDS must return the full extension: an empty or
            // partial read means the writer truncated the file mid-write.
            if (text.value.length === 0) {
              anomalies.push("empty: truncated mid-write");
            } else if (text.value.length !== PI_BLOBS_MCP_EXTENSION_SOURCE.length) {
              anomalies.push(
                `partial: ${text.value.length} of ${PI_BLOBS_MCP_EXTENSION_SOURCE.length} chars`,
              );
            }
          }),
        ),
      );
      yield* Fiber.join(writer);
      yield* Fiber.interrupt(reader);
      expect(anomalies).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

it("removes explicit skill and prompt resources while preserving model and authentication options", () => {
  assert.deepEqual(
    withoutPiPromptResources([
      "--skill",
      "/personal/SKILL.md",
      "--skill=/repo/SKILL.md",
      "--system-prompt",
      "personal",
      "--append-system-prompt=personal",
      "--prompt-template",
      "/personal/prompt.md",
      "--provider",
      "custom",
      "--api-key",
      "token",
    ]),
    ["--provider", "custom", "--api-key", "token"],
  );
});

describe("piBotLaunchArgs", () => {
  const launchArgs = [
    "--skill",
    "/mine/SKILL.md",
    "--system-prompt",
    "mine",
    "--provider",
    "custom",
  ];

  it("drops discovery and explicit resources unless the bot loads them", () => {
    assert.deepEqual(piBotLaunchArgs(launchArgs, { loadResources: false, systemPrompt: "bot" }), [
      "--provider",
      "custom",
      "--no-context-files",
      "--no-skills",
      "--no-prompt-templates",
      "--system-prompt",
      "bot",
    ]);
  });

  it("keeps Pi's discovery and explicit resources but always replaces the system prompt", () => {
    assert.deepEqual(piBotLaunchArgs(launchArgs, { loadResources: true, systemPrompt: "bot" }), [
      "--skill",
      "/mine/SKILL.md",
      "--provider",
      "custom",
      "--system-prompt",
      "bot",
    ]);
  });
});
