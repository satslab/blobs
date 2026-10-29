// @effect-diagnostics nodeBuiltinImport:off -- Electron resolves its data directory synchronously, before any Effect runtime exists.
import * as NodeFS from "node:fs";
import * as Option from "effect/Option";

export type JoinPath = (first: string, ...segments: string[]) => string;

function normalizeConfiguredBaseDir(t3Home: Option.Option<string>): Option.Option<string> {
  if (Option.isNone(t3Home)) {
    return Option.none();
  }
  const trimmed = t3Home.value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
}

export function resolveDesktopBaseDir(input: {
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly t3Home: Option.Option<string>;
  readonly exists?: (path: string) => boolean;
}): string {
  return Option.getOrElse(normalizeConfiguredBaseDir(input.t3Home), () => {
    const exists =
      input.exists ??
      ((path: string) => NodeFS.statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false);
    const t3Home = input.joinPath(input.homeDirectory, ".t3");
    return exists(t3Home) ? t3Home : input.joinPath(input.homeDirectory, ".blobs");
  });
}

export function resolveDesktopStateDir(input: {
  readonly baseDir: string;
  readonly isDevelopment: boolean;
  readonly joinPath: JoinPath;
  readonly t3Home: Option.Option<string>;
}): string {
  const useDevSubdir =
    input.isDevelopment && Option.isNone(normalizeConfiguredBaseDir(input.t3Home));
  return input.joinPath(input.baseDir, useDevSubdir ? "dev" : "userdata");
}
