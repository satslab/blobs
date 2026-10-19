import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };
import { cn } from "../../lib/utils";

const style = new Style(clay);
// A bot's face never changes, so each id is rendered once per motion state.
const dataUris = new Map<string, string>();

function avatarDataUri(seed: string, working: boolean) {
  const key = `${working ? "working" : "idle"}:${seed}`;
  let uri = dataUris.get(key);
  if (uri === undefined) {
    // Clay's motion is a slow squash, peek and jiggle: transforms only, and the SVG drops it
    // itself under prefers-reduced-motion. Resting avatars carry no animation at all.
    uri = new Avatar(style, working ? { seed, animationVariant: "fast" } : { seed }).toDataUri();
    dataUris.set(key, uri);
  }
  return uri;
}

/** A bot's face, seeded by its id so renaming or moving the bot keeps it. */
export function BotAvatar({
  botId,
  working = false,
  className,
}: {
  botId: string;
  working?: boolean;
  className?: string;
}) {
  return (
    <img
      src={avatarDataUri(botId, working)}
      alt=""
      draggable={false}
      className={cn("size-10 shrink-0 rounded-xl", className)}
    />
  );
}
