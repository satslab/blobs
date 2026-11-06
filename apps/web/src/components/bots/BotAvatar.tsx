import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };
import { cn } from "../../lib/utils";
import "./BotAvatar.css";

const style = new Style(clay);
const dataUris = new Map<string, string>();

function avatarDataUri(seed: string) {
  let uri = dataUris.get(seed);
  if (uri === undefined) {
    uri = new Avatar(style, { seed }).toDataUri();
    dataUris.set(seed, uri);
  }
  return uri;
}

type BotAvatarProps = {
  botId: string;
  working?: boolean;
  className?: string | undefined;
};

/** A bot's face, seeded by its id so renaming or moving the bot keeps it. */
export function BotAvatar({ botId, working = false, className }: BotAvatarProps) {
  if (working) return <WorkingBotAvatar botId={botId} className={className} />;
  return (
    <img
      src={avatarDataUri(botId)}
      alt=""
      draggable={false}
      className={cn("size-10 shrink-0 rounded-xl", className)}
    />
  );
}

function WorkingBotAvatar({ botId, className }: BotAvatarProps) {
  const markup = {
    __html: new Avatar(style, {
      seed: botId,
      animationVariant: "fast",
      idRandomization: true,
    }).toString(),
  };
  // DiceBear's embedded animation stylesheet must run in the document, rather than an img resource.
  return (
    <span
      aria-hidden="true"
      data-bot-working
      draggable={false}
      className={cn(
        "block size-10 shrink-0 overflow-hidden rounded-xl [&_svg]:block [&_svg]:size-full",
        className,
      )}
      dangerouslySetInnerHTML={markup}
    />
  );
}
