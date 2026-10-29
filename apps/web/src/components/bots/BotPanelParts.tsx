import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

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
  return (
    <section className="space-y-1.5 px-4 pt-4">
      <header className="flex min-h-6 items-center justify-between gap-4 px-3">
        <h3 className="min-w-0 truncate text-xs font-semibold">{title}</h3>
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
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground",
        tone === "attention" ? "border-warning/40" : "border-border/60",
      )}
    >
      {children}
    </div>
  );
}

/** Rows of a card, edge to edge and separated by hairlines. */
export function PanelList({ children }: { children: ReactNode }) {
  return <ul className="m-0 list-none divide-y divide-border/60 p-0">{children}</ul>;
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
