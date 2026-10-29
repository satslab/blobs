import type { ReactNode } from "react";

/** A bot settings section with its title above the card. */
export function PanelSection({
  title,
  aside,
  footer,
  children,
}: {
  title: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5 px-4 pt-5">
      <header className="flex min-h-7 items-center justify-between gap-4 px-3">
        <h3 className="min-w-0 truncate text-xs font-semibold">{title}</h3>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </header>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground">
        <div className="px-3 py-3">{children}</div>
        {footer ? <footer className="border-t border-border/60 px-3 py-2">{footer}</footer> : null}
      </div>
    </section>
  );
}

/** A list whose items are separated by hairlines. */
export function PanelRows({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y [&>li]:py-2 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0">
      {children}
    </ul>
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
