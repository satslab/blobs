import { createContext, use, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * How bot panel sections draw: boxed cards in the narrow side panel, or plain rows on the
 * full-page bot overview.
 */
export const PanelLookContext = createContext<"card" | "flat">("card");

/** A titled group in the bot panel: the title sits above whatever cards it holds. */
export function PanelGroup({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const flat = use(PanelLookContext) === "flat";
  return (
    <section className={cn("space-y-1.5", flat ? "pt-5" : "px-4 pt-4")}>
      <header
        className={cn("flex min-h-6 items-center justify-between gap-4", flat ? "px-0" : "px-3")}
      >
        <h3
          className={cn(
            "min-w-0 truncate text-xs font-semibold",
            flat && "tracking-wide text-muted-foreground uppercase",
          )}
        >
          {title}
        </h3>
        {aside ? (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
            {aside}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** The bordered card a panel section's rows sit in; `attention` marks work that needs the user. */
export function PanelCard({ tone, children }: { tone?: "attention"; children: ReactNode }) {
  const flat = use(PanelLookContext) === "flat";
  return (
    <div
      className={cn(
        "overflow-hidden",
        flat && tone !== "attention" ? "-mx-3" : "rounded-xl border bg-card text-card-foreground",
        tone === "attention"
          ? flat
            ? "-mx-3 border-destructive/25 bg-destructive/5"
            : "border-warning/40"
          : !flat && "border-border/60",
      )}
    >
      {children}
    </div>
  );
}

/** Rows of a card, edge to edge; hairlines separate them only in the side panel's cards. */
export function PanelList({ children }: { children: ReactNode }) {
  const flat = use(PanelLookContext) === "flat";
  return (
    <ul className={cn("m-0 list-none p-0", !flat && "divide-y divide-border/60")}>{children}</ul>
  );
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** A label on the left and its control on the right; controls in a card share one width. */
export function PanelField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="min-w-0 truncate text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}
