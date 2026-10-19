import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

export const botMemory = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "bots:memory",
  tag: WS_METHODS.botsMemory,
  staleTimeMs: 5000,
  refreshIntervalMs: 15000,
});
