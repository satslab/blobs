import type { ComponentType } from "react";

import { cn } from "../../lib/utils";

/** The phone layout's glass segmented control, like the native app's. */
export function MobileSegmented<Value extends string>(props: {
  label: string;
  options: ReadonlyArray<{
    value: Value;
    label: string;
    Icon?: ComponentType<{ className?: string }>;
  }>;
  value: Value;
  onChange: (value: Value) => void;
  size?: "md" | "lg";
  /** Shows only each option's icon; the label stays as its accessible name. */
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className={cn(
        "glass-float flex min-w-0 items-center gap-0.5 rounded-full p-1",
        props.size === "lg" ? "h-13" : "h-11",
        props.className,
      )}
    >
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={props.value === option.value}
          aria-label={props.iconOnly ? option.label : undefined}
          onClick={() => props.onChange(option.value)}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center justify-center gap-2 rounded-full font-medium outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            props.size === "lg" ? "text-base" : "text-sm",
            props.value === option.value
              ? "bg-foreground/8 text-foreground"
              : "text-muted-foreground",
          )}
        >
          {option.Icon ? <option.Icon className="size-5" /> : null}
          {props.iconOnly ? null : option.label}
        </button>
      ))}
    </div>
  );
}
