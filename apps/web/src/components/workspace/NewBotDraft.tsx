import {
  availableBotStarNames,
  BotId,
  DEFAULT_SERVER_SETTINGS,
  type BotIdentity,
} from "@satslab/contracts";
import { botChatProviderDisabledReason } from "@satslab/shared/botChat";
import { ArrowUpIcon, DicesIcon, InboxIcon, SearchIcon, SunriseIcon } from "lucide-react";
import { useState } from "react";

import { newMessageId, randomUUID } from "../../lib/utils";
import { useBots } from "../../state/bots";
import {
  useEnvironmentProviders,
  useEnvironments,
  usePrimaryEnvironmentId,
} from "../../state/environments";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { BotAvatar } from "../bots/BotAvatar";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { useCreateBot } from "../bots/useCreateBot";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";

const STARTERS = [
  {
    icon: SunriseIcon,
    label: "Daily brief",
    prompt:
      "Every morning, send me a short brief of what changed in my projects and what needs me today.",
  },
  {
    icon: PullRequestGlyph.pullRequest,
    label: "PR watcher",
    prompt:
      "Watch my open pull requests. Tell me when CI fails or a review comes in, and fix what you can.",
  },
  {
    icon: InboxIcon,
    label: "Inbox triage",
    prompt: "Go through my inbox, sort what needs a reply, and draft replies for me to approve.",
  },
  {
    icon: SearchIcon,
    label: "Research",
    prompt:
      "When I give you a topic, research it from primary sources and send me a short summary with links.",
  },
] as const;

const pickName = (taken: ReadonlyArray<string>) => {
  const names = availableBotStarNames(taken);
  return names[Math.floor(Math.random() * names.length)] ?? "";
};

/** A bot that exists only once its first message is sent. */
export function NewBotDraft({
  onCreated,
  onCancel,
}: {
  onCreated: (bot: BotIdentity) => void;
  onCancel: () => void;
}) {
  const bots = useBots();
  const { environments } = useEnvironments();
  const providers = useEnvironmentProviders();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const createBot = useCreateBot();
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [botId, setBotId] = useState(() => BotId.make(randomUUID()));
  const [name, setName] = useState(() => pickName(bots.map((bot) => bot.name)));
  const [text, setText] = useState("");
  const [chosenEnvironmentId, setChosenEnvironmentId] = useState(primaryEnvironmentId);
  const [sending, setSending] = useState(false);
  const connected = environments.filter((item) => item.connection.phase === "connected");
  const environment =
    connected.find((item) => item.environmentId === chosenEnvironmentId) ?? connected[0];
  const canChat =
    environment !== undefined &&
    (providers.get(environment.environmentId) ?? []).some(
      (provider) => botChatProviderDisabledReason(provider) === null,
    );
  const ready = canChat && !sending && name.trim() !== "" && text.trim() !== "";

  const send = async () => {
    if (!ready) return;
    setSending(true);
    const created = await createBot(environment.environmentId, name.trim(), botId);
    if (created._tag !== "Success") {
      setSending(false);
      return;
    }
    const settings = environment.serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS;
    const turn = await startTurn({
      environmentId: created.value.ownerEnvironmentId,
      input: {
        threadId: created.value.threadId,
        message: { messageId: newMessageId(), role: "user", text: text.trim(), attachments: [] },
        runtimeMode: settings.defaultRuntimeMode,
        interactionMode: "default",
        dispatchMode: "queue",
      },
    });
    if (turn._tag === "Failure") {
      toastManager.add({ type: "error", title: `${created.value.name} didn't get your message` });
    }
    onCreated(created.value);
  };

  const shuffle = () => {
    setBotId(BotId.make(randomUUID()));
    setName(pickName(bots.map((bot) => bot.name)));
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pt-10 pb-24 scrollbar-gutter-both"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !sending) onCancel();
      }}
    >
      <div className="flex w-full max-w-(--chat-content-max-width) flex-col items-center">
        <div className="relative">
          <BotAvatar botId={botId} className="size-28 rounded-full" />
          <Button
            size="icon-sm-pill"
            variant="outline"
            aria-label="Shuffle face and name"
            disabled={sending}
            onClick={shuffle}
            className="absolute -right-1 -bottom-1"
          >
            <DicesIcon />
          </Button>
        </div>
        <input
          aria-label="Name"
          value={name}
          maxLength={255}
          disabled={sending}
          size={Math.max(name.length, 4)}
          onChange={(event) => setName(event.target.value)}
          className="mt-4 rounded-lg bg-transparent px-2 text-center text-2xl font-semibold outline-hidden hover:bg-accent/60 focus-visible:bg-accent/60"
        />
        <form
          className="mt-8 w-full rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-foreground/20"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            autoFocus
            aria-label={`What's ${name.trim() || "this bot"} for?`}
            placeholder={`What's ${name.trim() || "this bot"} for?`}
            value={text}
            disabled={sending}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            className="block max-h-60 min-h-14 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-hidden field-sizing-content placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2">
            {connected.length > 1 && environment ? (
              <Select
                value={environment.environmentId}
                disabled={sending}
                onValueChange={(next) => {
                  const picked = connected.find((item) => item.environmentId === next);
                  if (picked) setChosenEnvironmentId(picked.environmentId);
                }}
              >
                <SelectTrigger size="xs" variant="ghost" aria-label="Machine">
                  <SelectValue>{environment.label}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {connected.map((item) => (
                    <SelectItem key={item.environmentId} value={item.environmentId}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            ) : null}
            <Button
              type="submit"
              size="icon-sm-pill"
              aria-label="Create and send"
              disabled={!ready}
              className="ml-auto"
            >
              <ArrowUpIcon />
            </Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          {STARTERS.map((starter) => (
            <Button
              key={starter.label}
              size="sm"
              variant="ghost-muted"
              disabled={sending}
              onClick={() => setText(starter.prompt)}
            >
              <starter.icon />
              {starter.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
