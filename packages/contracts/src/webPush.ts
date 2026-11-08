import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** A browser's push subscription: where to send, and the keys its payloads are encrypted to. */
export const WebPushSubscription = Schema.Struct({
  endpoint: TrimmedNonEmptyString,
  /** The subscription's P-256 public key, base64url. */
  p256dh: TrimmedNonEmptyString,
  /** The subscription's authentication secret, base64url. */
  auth: TrimmedNonEmptyString,
});
export type WebPushSubscription = typeof WebPushSubscription.Type;

/**
 * The VAPID key pair a client signs its subscription with. The client makes one and hands it to
 * every environment it enables, so each of them can push to the one subscription a browser allows.
 */
export const WebPushVapidKeys = Schema.Struct({
  /** Uncompressed P-256 public key, base64url. */
  publicKey: TrimmedNonEmptyString,
  /** The private scalar `d`, base64url. */
  privateKey: TrimmedNonEmptyString,
});
export type WebPushVapidKeys = typeof WebPushVapidKeys.Type;

export const WebPushRegisterInput = Schema.Struct({
  /** Identifies one browser install across register, status, test, and unregister. */
  deviceId: TrimmedNonEmptyString,
  /** Names the device in Settings, such as "iPhone web app". */
  label: Schema.String.check(Schema.isMaxLength(120)),
  subscription: WebPushSubscription,
  vapid: WebPushVapidKeys,
});
export type WebPushRegisterInput = typeof WebPushRegisterInput.Type;

export const WebPushDeviceInput = Schema.Struct({ deviceId: TrimmedNonEmptyString });
export type WebPushDeviceInput = typeof WebPushDeviceInput.Type;

export const WebPushSetEnabledInput = Schema.Struct({
  deviceId: TrimmedNonEmptyString,
  enabled: Schema.Boolean,
});
export type WebPushSetEnabledInput = typeof WebPushSetEnabledInput.Type;

/** A browser registered for an environment's notifications, as any client may manage it. */
export const WebPushDevice = Schema.Struct({
  deviceId: Schema.String,
  label: Schema.String,
  /** Off keeps the subscription, so any client can turn it back on without the device. */
  enabled: Schema.Boolean,
});
export type WebPushDevice = typeof WebPushDevice.Type;

export const WebPushDevices = Schema.Struct({ devices: Schema.Array(WebPushDevice) });
export type WebPushDevices = typeof WebPushDevices.Type;

export class WebPushError extends Schema.TaggedError<WebPushError>()("WebPushError", {
  reason: Schema.Literals(["not-registered", "storage", "delivery"]),
  message: Schema.String,
}) {}
