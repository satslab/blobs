// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "SORA_CLERK_PUBLISHABLE_KEY=pk_root\nSORA_CLERK_JWT_TEMPLATE=template_root\nSORA_CLERK_CLI_OAUTH_CLIENT_ID=oauth_root\nSORA_RELAY_URL=https://root.example.test\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env.local"),
      "SORA_CLERK_PUBLISHABLE_KEY=pk_local\nSORA_CLERK_JWT_TEMPLATE=template_local\nSORA_CLERK_CLI_OAUTH_CLIENT_ID=oauth_local\nSORA_RELAY_URL=https://local.example.test\n",
    );

    expect(loadRepoEnv({ baseEnv: {}, repoRoot }).SORA_RELAY_URL).toBe(
      "https://local.example.test",
    );
    expect(
      loadRepoEnv({
        baseEnv: {
          SORA_CLERK_PUBLISHABLE_KEY: "pk_ci",
          SORA_CLERK_JWT_TEMPLATE: "template_ci",
          SORA_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
          SORA_RELAY_URL: "https://ci.example.test",
        },
        repoRoot,
      }),
    ).toMatchObject({
      SORA_CLERK_PUBLISHABLE_KEY: "pk_ci",
      SORA_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_ci",
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_ci",
      SORA_CLERK_JWT_TEMPLATE: "template_ci",
      VITE_CLERK_JWT_TEMPLATE: "template_ci",
      EXPO_PUBLIC_CLERK_JWT_TEMPLATE: "template_ci",
      SORA_RELAY_URL: "https://ci.example.test",
      VITE_SORA_RELAY_URL: "https://ci.example.test",
    });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "sora-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
