import { WS_METHODS } from "@satslab/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@satslab/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const webPushDevices = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "webPush:devices",
  tag: WS_METHODS.serverWebPushDevices,
  staleTimeMs: 30_000,
});
export const webPushRegister = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "webPush:register",
  tag: WS_METHODS.serverWebPushRegister,
});
export const webPushSetEnabled = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "webPush:setEnabled",
  tag: WS_METHODS.serverWebPushSetEnabled,
});
export const webPushUnregister = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "webPush:unregister",
  tag: WS_METHODS.serverWebPushUnregister,
});
export const webPushTest = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "webPush:test",
  tag: WS_METHODS.serverWebPushTest,
});
