import { createFileRoute } from "@tanstack/react-router";

// WorkspaceLayout renders this page from the URL.
export const Route = createFileRoute("/bots/settings/$environmentId/$botId")({
  component: () => null,
});
