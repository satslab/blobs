// Eval-only helper: it reads the local Codex config through python3 at startup.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as Schema from "effect/Schema";

// Read credentials into memory only. Python's TOML parser avoids another runner dependency.
const decodeProxyConfig = Schema.decodeUnknownSync(
  Schema.Struct({ url: Schema.String, headers: Schema.Record(Schema.String, Schema.String) }),
);
/** Reads the selected Codex provider, falling back to the legacy CLIProxyAPI provider name. */
export const proxyConfig = () =>
  decodeProxyConfig(
    JSON.parse(
      NodeChildProcess.execFileSync(
        "python3",
        [
          "-c",
          `
import json, os, pathlib, subprocess, tomllib
home = pathlib.Path(os.environ.get('CODEX_HOME', pathlib.Path.home() / '.codex'))
config = tomllib.loads((home / 'config.toml').read_text())
p = config['model_providers'][config.get('model_provider', 'vibeproxy')]
h = p.get('http_headers', {}).copy()
h.update({k: os.environ[v] for k,v in p.get('env_http_headers', {}).items()})
key = os.environ[p['env_key']] if p.get('env_key') else p.get('experimental_bearer_token')
auth = p.get('auth', {})
if not key and auth.get('command'):
    try:
        result = subprocess.run([auth['command'], *auth.get('args', [])], capture_output=True, text=True, timeout=auth.get('timeout_ms', 10000) / 1000)
    except subprocess.SubprocessError:
        raise RuntimeError('Configured Codex auth command failed') from None
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError('Configured Codex auth command returned no token')
    key = result.stdout.strip()
if not key and p.get('requires_openai_auth'): key = json.loads((home / 'auth.json').read_text()).get('OPENAI_API_KEY')
if key: h['Authorization'] = 'Bearer ' + key
print(json.dumps({'url': p['base_url'].rstrip('/'), 'headers': h}))
`,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
