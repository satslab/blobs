import type { ComponentProps, ReactNode } from "react";

import { SettingsGroup } from "../settings/SettingsGroup";
import { cn } from "../../lib/utils";

export function ThreadDetailsSection({
  headingId,
  title,
  actions,
  separated = true,
  showHeading = true,
  variant = "inline",
  padded = true,
  children,
  ...props
}: Omit<ComponentProps<"section">, "className" | "style" | "title" | "aria-labelledby"> & {
  headingId: string;
  title: string;
  actions?: ReactNode;
  separated?: boolean;
  showHeading?: boolean;
  variant?: "inline" | "card";
  padded?: boolean;
}) {
  return (
    <section
      {...props}
      aria-labelledby={showHeading ? headingId : undefined}
      aria-label={showHeading ? undefined : title}
      // The first section in a card has nothing above it to separate from.
      className={cn(
        variant === "card" ? "space-y-1.5" : "px-2 pt-2 pb-2.5",
        variant === "inline" && separated && "border-t border-border/65 first:border-t-0",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center justify-between gap-2",
          variant === "card" ? "min-h-7 px-0.5" : "mb-1 min-h-8 px-1.5",
          !showHeading && "hidden",
        )}
      >
        <h3
          id={headingId}
          className={cn(
            "min-w-0 truncate select-none",
            variant === "card"
              ? "text-xs font-semibold text-foreground"
              : "text-2xs font-medium text-muted-foreground",
          )}
        >
          {title}
        </h3>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {variant === "card" ? (
        <SettingsGroup divided={false}>
          <div className={cn("overflow-clip rounded-xl", padded && "p-2")}>{children}</div>
        </SettingsGroup>
      ) : (
        children
      )}
    </section>
  );
}
