import { createContext, use, type ComponentProps } from "react";

import { cn } from "../../lib/utils";

/**
 * Settings pages draw groups as bordered cards. A page can switch its groups to plain rows without
 * borders or dividers, as the bots workspace does.
 */
export const SettingsLookContext = createContext<"cards" | "flat">("cards");

export function SettingsGroup({
  variant = "grouped",
  divided = true,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "grouped" | "plain";
  divided?: boolean;
}) {
  const flat = use(SettingsLookContext) === "flat";
  const grouped = variant === "grouped" && !flat;
  return (
    <div
      data-slot="settings-group"
      {...props}
      className={cn(
        "relative overflow-visible text-foreground",
        grouped ? "rounded-xl border border-border/60 bg-card/40 shadow-xs/5" : "space-y-1",
        grouped &&
          divided &&
          "[&>*+*]:border-t [&>*+*]:border-border/50 [&>[data-slot=settings-row]]:rounded-none",
        className,
      )}
    />
  );
}
