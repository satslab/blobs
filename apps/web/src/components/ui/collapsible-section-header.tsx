import type { ComponentProps, ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const tones = {
  muted: { label: "text-sidebar-muted-foreground", line: "bg-sidebar-border/50" },
  emphasized: { label: "text-sidebar-foreground/80", line: "bg-sidebar-foreground/25" },
  accent: { label: "text-primary", line: "bg-primary/50" },
} as const;

export function CollapsibleSectionHeader({
  children,
  expanded,
  tone = "muted",
  variant = "default",
  accessory,
  count,
  ...buttonProps
}: Omit<ComponentProps<"button">, "className" | "style" | "aria-expanded"> & {
  expanded: boolean;
  tone?: keyof typeof tones;
  variant?: "default" | "panel" | "card";
  count?: number;
  accessory?: ReactNode;
}) {
  const ChevronIcon = variant === "card" ? ChevronRightIcon : ChevronDownIcon;
  return (
    <button
      {...buttonProps}
      type="button"
      aria-expanded={expanded}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        variant === "card"
          ? "h-10 px-3 font-normal text-foreground hover:bg-muted/40"
          : cn(
              "h-8 rounded-md font-medium",
              variant === "panel" ? "ps-2 pe-2.5" : "px-2",
              tones[tone].label,
            ),
      )}
    >
      <span className="shrink-0">{children}</span>
      <span
        aria-hidden
        className={cn(
          "min-w-2 flex-1",
          variant !== "card" && cn("h-px", tones[tone].line, accessory && "invisible"),
        )}
      />
      {count !== undefined ? (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
      {accessory}
      <ChevronIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0 transition-transform",
          variant === "card" ? "text-muted-foreground" : undefined,
          variant === "card" ? expanded && "rotate-90" : !expanded && "-rotate-90",
        )}
      />
    </button>
  );
}

export function SectionHeaderStatus({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-3xs leading-none text-destructive-foreground">{children}</span>
  );
}
