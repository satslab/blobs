import type { WebPushRegisterInput, WebPushVapidKeys } from "@satslab/contracts";
import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";
import { randomUUID } from "./lib/utils";

/**
 * Web push on this browser: one subscription, signed with a VAPID key pair this browser makes and
 * hands to every environment it enables, so each of them can push to it.
 */

const DEVICE_ID_KEY = "blobs.webPush.deviceId";
const VAPID_KEYS_KEY = "blobs.webPush.vapid";
const DISMISSED_KEY = "blobs.webPush.dismissed";
const SERVICE_WORKER_URL = "/push-sw.js";

const VapidKeys = Schema.Struct({ publicKey: Schema.String, privateKey: Schema.String });
const DismissedEnvironments = Schema.Array(Schema.String);

export type WebPushSupport =
  /** Push works here. */
  | "supported"
  /** An iPhone or iPad browser tab: push needs the app added to the Home Screen first. */
  | "needs-install"
  | "unsupported";

/** Opened as the installed app, not a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export function webPushSupport(): WebPushSupport {
  if (typeof window === "undefined" || window.desktopBridge !== undefined) return "unsupported";
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return "unsupported";
  if ("PushManager" in window && "Notification" in window) return "supported";
  return isAppleMobile() && !isStandalone() ? "needs-install" : "unsupported";
}

export function webPushDeviceId(): string {
  const existing = getLocalStorageItem(DEVICE_ID_KEY, Schema.String);
  if (existing) return existing;
  const created = randomUUID();
  setLocalStorageItem(DEVICE_ID_KEY, created, Schema.String);
  return created;
}

function deviceLabel() {
  const agent = navigator.userAgent;
  const device = /iPhone/.test(agent)
    ? "iPhone"
    : /iPad/.test(agent) || (agent.includes("Macintosh") && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(agent)
        ? "Android"
        : /Mac/.test(agent)
          ? "Mac"
          : /Windows/.test(agent)
            ? "Windows"
            : "Browser";
  return `${device} web app`;
}

const toBase64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const fromBase64url = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );

async function vapidKeys(): Promise<WebPushVapidKeys> {
  const existing = getLocalStorageItem(VAPID_KEYS_KEY, VapidKeys);
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!d) throw new Error("The browser did not export the notification key.");
  const created = { publicKey: toBase64url(publicKey), privateKey: d };
  setLocalStorageItem(VAPID_KEYS_KEY, created, VapidKeys);
  return created;
}

function registerWebPushServiceWorker() {
  return navigator.serviceWorker.register(SERVICE_WORKER_URL);
}

/**
 * Asks for permission and subscribes this browser, returning what an environment needs to push
 * to it. Must run from a tap: browsers only show the permission prompt for one.
 */
export async function subscribeToWebPush(): Promise<WebPushRegisterInput> {
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error("Notifications are blocked. Allow them in your browser or system settings.");
  const registration = await registerWebPushServiceWorker();
  await navigator.serviceWorker.ready;
  const vapid = await vapidKeys();
  const serverKey = fromBase64url(vapid.publicKey);
  let subscription = await registration.pushManager.getSubscription();
  const subscribedKey = subscription?.options.applicationServerKey;
  // A subscription made with another key cannot be signed for, so start over.
  if (
    subscription &&
    (!subscribedKey || toBase64url(new Uint8Array(subscribedKey)) !== toBase64url(serverKey))
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey,
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    throw new Error("The browser returned an incomplete push subscription.");
  return {
    deviceId: webPushDeviceId(),
    label: deviceLabel(),
    subscription: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    vapid,
  };
}

/** Environments this browser was asked about and declined; they are not asked again. */
export function webPushDismissed(environmentId: string) {
  return (getLocalStorageItem(DISMISSED_KEY, DismissedEnvironments) ?? []).includes(environmentId);
}

export function dismissWebPushPrompt(environmentId: string) {
  const dismissed = getLocalStorageItem(DISMISSED_KEY, DismissedEnvironments) ?? [];
  if (!dismissed.includes(environmentId))
    setLocalStorageItem(DISMISSED_KEY, [...dismissed, environmentId], DismissedEnvironments);
}

/** Opens the app at a notification's link when one is tapped while the app is already open. */
export function listenForWebPushNavigation(navigate: (href: string) => void) {
  if (!("serviceWorker" in navigator)) return () => {};
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; url?: unknown } | null;
    if (data?.type !== "blobs:navigate" || typeof data.url !== "string") return;
    const url = new URL(data.url);
    if (url.origin === window.location.origin) navigate(`${url.pathname}${url.search}`);
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}
