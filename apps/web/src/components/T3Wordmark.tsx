import type { SVGProps } from "react";

export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-label={props["aria-label"] === "T3" ? "Blobs" : props["aria-label"]}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image href="/blobs-mark.png" width="128" height="128" />
    </svg>
  );
}
