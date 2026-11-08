import type { EnvironmentId } from "@satslab/contracts";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@satslab/client-runtime/state/runtime";
import { useRouter } from "@tanstack/react-router";
import { BellIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import {
  webPushDevices,
  webPushRegister,
  webPushSetEnabled,
  webPushTest,
  webPushUnregister,
} from "../../state/webPush";
import {
  dismissWebPushPrompt,
  isStandalone,
  listenForWebPushNavigation,
  subscribeToWebPush,
  webPushDeviceId,
  webPushDismissed,
  webPushSupport,
} from "../../webPush";
import { useEnvironments, usePrimaryEnvironment } from "../../state/environments";
import { searchableSetting } from "../settings/settingsSearch";
import { SettingsRow } from "../settings/settingsLayout";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";
import { useMobileLayout } from "../mobile/mobileLayout";
import { useDragToDismiss } from "../mobile/useDragToDismiss";
import { toastManager } from "../ui/toast";

/** Throws a failed command's error, so `run` reports it. */
function throwFailure(result: Parameters<typeof squashAtomCommandFailure>[0]): never {
  const error = squashAtomCommandFailure(result);
  throw error instanceof Error ? error : new Error("Something went wrong.");
}

/** An environment's notification devices, and the ways to change them from this client. */
function useWebPush(environmentId: EnvironmentId | null) {
  const support = webPushSupport();
  const deviceId = support === "supported" ? webPushDeviceId() : null;
  const query = useEnvironmentQuery(
    environmentId ? webPushDevices({ environmentId, input: {} }) : null,
  );
  const register = useAtomCommand(webPushRegister, { label: "enable notifications" });
  const setEnabled = useAtomCommand(webPushSetEnabled, { label: "change notifications" });
  const unregister = useAtomCommand(webPushUnregister, { label: "remove a device" });
  const test = useAtomCommand(webPushTest, { label: "send a test notification" });
  const [busy, setBusy] = useState(false);
  const devices = query.data?.devices ?? null;

  const run = async (work: (environmentId: EnvironmentId) => Promise<unknown>) => {
    if (!environmentId) return false;
    setBusy(true);
    const ok = await work(environmentId).then(
      () => true,
      (error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Notifications",
          description: error instanceof Error ? error.message : "Something went wrong.",
        });
        return false;
      },
    );
    setBusy(false);
    query.refresh();
    return ok;
  };
  const check = <A, E>(result: AtomCommandResult<A, E>) => {
    if (result._tag === "Failure") throwFailure(result);
  };

  return {
    support,
    devices,
    /** Whether this browser is registered here; null while unknown or when it cannot receive push. */
    registered: devices && deviceId ? devices.some((device) => device.deviceId === deviceId) : null,
    deviceId,
    busy,
    /** Subscribes this browser. Asks for notification permission. */
    enable: () =>
      run(async (environmentId) =>
        check(await register({ environmentId, input: await subscribeToWebPush() })),
      ),
    setEnabled: (deviceId: string, enabled: boolean) =>
      run(async (environmentId) =>
        check(await setEnabled({ environmentId, input: { deviceId, enabled } })),
      ),
    remove: (deviceId: string) =>
      run(async (environmentId) => check(await unregister({ environmentId, input: { deviceId } }))),
    test: (deviceId: string) =>
      run(async (environmentId) => check(await test({ environmentId, input: { deviceId } }))),
  };
}

/**
 * Asks once, in the installed app on a browser that can receive push, whether the environment it
 * was opened from should notify it. "Not now" is remembered; Settings can turn it on later.
 */
function WebPushPrompt() {
  const environment = usePrimaryEnvironment();
  const environmentId = environment?.environmentId ?? null;
  const webPush = useWebPush(environmentId);
  const mobile = useMobileLayout();
  const [closed, setClosed] = useState(false);
  const open =
    !closed &&
    environmentId !== null &&
    webPush.support === "supported" &&
    isStandalone() &&
    Notification.permission !== "denied" &&
    webPush.registered === false &&
    !webPushDismissed(environmentId);
  const decline = () => {
    if (environmentId) dismissWebPushPrompt(environmentId);
    setClosed(true);
  };
  const onOpenChange = (next: boolean) => {
    if (!next) decline();
  };
  const content = (
    <PromptContent
      label={environment?.label ?? ""}
      Title={mobile ? SheetTitle : DialogTitle}
      busy={webPush.busy}
      onDecline={decline}
      onEnable={async () => {
        if (await webPush.enable()) setClosed(true);
      }}
    />
  );
  return mobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup side="bottom" variant="rounded" showCloseButton={false}>
        <DraggableSheetBody onDismiss={decline}>{content}</DraggableSheetBody>
      </SheetPopup>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup showCloseButton={false} className="max-w-sm">
        <div className="px-6 pt-8 pb-6">{content}</div>
      </DialogPopup>
    </Dialog>
  );
}

function DraggableSheetBody(props: { onDismiss: () => void; children: ReactNode }) {
  const dragToDismiss = useDragToDismiss(props.onDismiss);
  return (
    <div {...dragToDismiss} className="relative touch-none bg-white px-6 pt-9 pb-safe dark:bg-card">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/20"
      />
      <div className="pb-6">{props.children}</div>
    </div>
  );
}

function PromptContent(props: {
  label: string;
  Title: typeof SheetTitle | typeof DialogTitle;
  busy: boolean;
  onDecline: () => void;
  onEnable: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BellIcon className="size-8" />
      </span>
      <props.Title render={<h2 className="mt-4 text-xl font-semibold" />}>
        Turn on notifications
      </props.Title>
      <p className="mt-2 text-base text-muted-foreground">
        Know when an agent on <span className="font-medium text-foreground">{props.label}</span>{" "}
        needs you or finishes.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onEnable}
          className="h-13 rounded-full bg-primary text-base font-semibold text-primary-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:opacity-80 disabled:opacity-50"
        >
          Turn on
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onDecline}
          className="h-13 rounded-full text-base font-medium text-muted-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** Settings: each connected environment's notification devices, manageable from any client. */
export function WebPushSettings() {
  const { environments } = useEnvironments();
  const support = webPushSupport();
  const connected = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  return (
    <SettingsRow
      {...searchableSetting("push-notifications")}
      description={
        support === "needs-install"
          ? "Notifications on your devices when a thread finishes, fails, or needs input or approval. To add this device, add Blobs to your Home Screen and open it from there."
          : "Notifications on your devices when a thread finishes, fails, or needs input or approval, even while Blobs is closed."
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        {connected.map((environment) => (
          <WebPushEnvironment
            key={environment.environmentId}
            environmentId={environment.environmentId}
            label={environment.label}
          />
        ))}
      </div>
    </SettingsRow>
  );
}

function WebPushEnvironment(props: { environmentId: EnvironmentId; label: string }) {
  const webPush = useWebPush(props.environmentId);
  return (
    <div className="flex flex-col divide-y divide-border/60 rounded-lg border">
      <div className="flex min-h-10 items-center gap-3 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{props.label}</span>
        {webPush.registered === false ? (
          <Button size="xs" variant="outline" disabled={webPush.busy} onClick={webPush.enable}>
            Notify this device
          </Button>
        ) : null}
      </div>
      {webPush.devices?.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">No devices</p>
      ) : null}
      {webPush.devices?.map((device) => (
        <div key={device.deviceId} className="flex items-center gap-2 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm">
            {device.label}
            {device.deviceId === webPush.deviceId ? (
              <span className="text-muted-foreground"> · This device</span>
            ) : null}
          </span>
          <Button
            size="xs"
            variant="ghost"
            disabled={webPush.busy}
            onClick={async () => {
              if (await webPush.test(device.deviceId))
                toastManager.add({ type: "success", title: "Test notification sent" });
            }}
          >
            Send test
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={webPush.busy}
            onClick={() => void webPush.remove(device.deviceId)}
            aria-label={`Remove ${device.label}`}
          >
            <XIcon />
          </Button>
          <Switch
            checked={device.enabled}
            disabled={webPush.busy}
            onCheckedChange={(checked) => void webPush.setEnabled(device.deviceId, checked)}
            aria-label={`Notifications on ${device.label}`}
          />
        </div>
      ))}
    </div>
  );
}

/** The first-run prompt, and notification taps routed into the already-open app. */
export function WebPushHost() {
  const router = useRouter();
  // oxlint-disable-next-line blobs/no-unreasoned-state-sync -- subscribes to service-worker messages for notification taps
  useEffect(() => listenForWebPushNavigation((href) => void router.navigate({ href })), [router]);
  return <WebPushPrompt />;
}
