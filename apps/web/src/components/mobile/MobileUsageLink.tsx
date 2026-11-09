import { Link } from "@tanstack/react-router";
import { ChartNoAxesColumnIcon } from "lucide-react";

/** The drawer's way into Usage, in its bottom bar. */
export function MobileUsageLink() {
  return (
    <Link
      to="/usage"
      aria-label="Usage"
      className="glass-float flex size-13 shrink-0 items-center justify-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <ChartNoAxesColumnIcon className="size-5.5" />
    </Link>
  );
}
