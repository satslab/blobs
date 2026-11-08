import { useAtomValue } from "@effect/atom-react";
import { collectLimitAccounts, collectLimitPools } from "@satslab/shared/usageLimits";
import { Link } from "@tanstack/react-router";
import { ChartNoAxesColumnIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { environmentPresentations } from "../../state/presentation";

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The drawer's way into Usage, in its bottom bar. Its ring fills to the most-used subscription limit. */
export function MobileUsageGauge() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  // Only exhausted windows read the clock, to place their refill; mount time is close enough.
  const [now] = useState(Date.now);
  const windows = collectLimitPools(collectLimitAccounts(presentations), now).flatMap(
    (pool) => pool.windows,
  );
  const used = Math.max(0, ...windows.map((window) => window.usedPercent));
  return (
    <Link
      to="/usage"
      aria-label={windows.length > 0 ? `Usage, ${used}% of a limit used` : "Usage"}
      className="glass-float flex size-13 shrink-0 items-center justify-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {windows.length === 0 ? (
        <ChartNoAxesColumnIcon className="size-5.5" />
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" className="size-6.5 -rotate-90">
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            className="stroke-foreground/15"
          />
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(used, 100) / 100)}
            className={cn(
              used >= 90 ? "stroke-destructive" : "stroke-foreground",
              used === 0 && "hidden",
            )}
          />
        </svg>
      )}
    </Link>
  );
}
