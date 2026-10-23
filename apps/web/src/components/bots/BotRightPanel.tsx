import type { ScopedThreadRef } from "@satslab/contracts";
import { XIcon } from "lucide-react";
import { usePreviewPanelInlineSize } from "../../hooks/usePreviewPanelInlineSize";
import { RightPanelSheet } from "../RightPanelSheet";
import { PreviewPanelShell } from "../preview/PreviewPanelShell";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { BotIntegrationPanel } from "./BotIntegrationPanel";
import { BotMemoryPanel } from "./BotMemoryPanel";
import { ThreadRelationshipsPanel } from "../chat/ThreadRelationshipsControl";

export function BotRightPanel(props: {
  threadRef: ScopedThreadRef;
  open: boolean;
  sheet: boolean;
  animationDurationMs: number;
  workspaceLayoutElement: HTMLElement | null;
  widthStorageKey: string;
  onClose: () => void;
}) {
  const inlineSize = usePreviewPanelInlineSize(undefined, {
    enabled: !props.sheet,
    container: props.workspaceLayoutElement,
    widthStorageKey: props.widthStorageKey,
  });
  const panel = (
    <PreviewPanelShell
      mode={props.sheet ? "sheet" : "inline"}
      open={props.open}
      inlineSize={inlineSize}
    >
      <section aria-label="Bot panel" data-bot-panel className="flex h-full min-h-0 flex-col">
        <div className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center justify-end px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close bot panel"
            onClick={props.onClose}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-4 pt-1 pb-5">
            <BotMemoryPanel threadRef={props.threadRef} />
            <ThreadRelationshipsPanel
              key={`${props.threadRef.environmentId}:${props.threadRef.threadId}`}
              environmentId={props.threadRef.environmentId}
              threadId={props.threadRef.threadId}
              showEmpty
              sectionVariant="card"
            />
            <BotIntegrationPanel threadRef={props.threadRef} />
          </div>
        </ScrollArea>
      </section>
    </PreviewPanelShell>
  );
  return props.sheet ? (
    <RightPanelSheet
      open={props.open}
      onClose={props.onClose}
      animationDurationMs={props.animationDurationMs}
    >
      {panel}
    </RightPanelSheet>
  ) : (
    panel
  );
}
