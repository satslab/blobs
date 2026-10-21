import {
  AntigravitySettings,
  ClaudeSettings,
  CodexSettings,
  isProviderDriverKind,
  ProviderDriverKind,
} from "@satslab/contracts";
import { acpRegistryClient } from "@satslab/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@satslab/provider-core/client";
import { modelShortName } from "@satslab/provider-core/modelShortName";
import { cursorClient } from "@satslab/provider-cursor/client";
import { fxClient } from "@satslab/provider-fx/client";
import { grokClient } from "@satslab/provider-grok/client";
import { museClient } from "@satslab/provider-muse/client";
import { openCodeClient } from "@satslab/provider-opencode/client";
import { piClient } from "@satslab/provider-pi/client";

export const providerClients = makeProviderClientRegistry([
  {
    driverKind: ProviderDriverKind.make("codex"),
    label: "Codex",
    modelFamilies: ["GPT-", "GPT "],
    acpRegistryAgentIds: ["codex-acp"],
    settingsSchema: CodexSettings,
  },
  {
    driverKind: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    modelFamilies: ["Claude "],
    acpRegistryAgentIds: ["claude-acp"],
    settingsSchema: ClaudeSettings,
  },
  cursorClient,
  grokClient,
  fxClient,
  openCodeClient,
  {
    driverKind: ProviderDriverKind.make("antigravity"),
    label: "Antigravity",
    modelFamilies: ["Gemini "],
    acpRegistryAgentIds: ["antigravity-acp"],
    settingsSchema: AntigravitySettings,
  },
  museClient,
  piClient,
  acpRegistryClient,
]);

export function getProviderClient(driver: string | null | undefined) {
  return isProviderDriverKind(driver) ? providerClients.get(driver) : undefined;
}

export function resolveModelShortName(
  model: { readonly name: string; readonly shortName?: string | undefined },
  driverKind: ProviderDriverKind | null | undefined,
): string | undefined {
  if (model.shortName) return model.shortName;
  const families = driverKind ? providerClients.get(driverKind)?.modelFamilies : undefined;
  return modelShortName(model.name, families ?? []);
}
