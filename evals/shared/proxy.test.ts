// @effect-diagnostics nodeBuiltinImport:off - The fixture runs the Node eval helper with an isolated Codex home.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

it.each(["cpa", "vibeproxy"])(
  "loads %s credentials through its configured auth command",
  async (provider) => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "blobs-eval-proxy-"));
    try {
      await NodeFSP.writeFile(
        NodePath.join(directory, "config.toml"),
        [
          ...(provider === "vibeproxy" ? [] : [`model_provider = ${JSON.stringify(provider)}`]),
          `[model_providers.${provider}]`,
          'base_url = "https://proxy.example/v1/"',
          `[model_providers.${provider}.auth]`,
          `command = ${JSON.stringify(process.execPath)}`,
          `args = ${JSON.stringify(["-e", "process.stdout.write('fixture-token\\n')"])}`,
          "timeout_ms = 10000",
        ].join("\n"),
      );
      const code = `import { proxyConfig } from ${JSON.stringify(new URL("./proxy.ts", import.meta.url).href)}; process.stdout.write(JSON.stringify(proxyConfig()));`;
      const output = NodeChildProcess.execFileSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        {
          encoding: "utf8",
          env: { ...process.env, CODEX_HOME: directory },
        },
      );
      expect(JSON.parse(output)).toEqual({
        url: "https://proxy.example/v1",
        headers: { Authorization: "Bearer fixture-token" },
      });
    } finally {
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  },
);
