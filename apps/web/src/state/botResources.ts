import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

export const botResources = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "bots:resources",
  tag: WS_METHODS.botsResources,
  staleTimeMs: 1000,
  refreshIntervalMs: 15000,
});
export const botResourcesChange = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "bots:resources:change",
  tag: WS_METHODS.botsResourcesChange,
});
export const botCheckIn = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "bots:check-in",
  tag: WS_METHODS.botsCheckIn,
});
