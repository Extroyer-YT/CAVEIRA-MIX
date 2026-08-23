import { createFileRoute, redirect } from "@tanstack/react-router";

// The Caveira Mix site is a static app served from /live/ (public/live/).
// Redirect the app root to it so the preview and production both open the radio.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ href: "/live/index.html" });
  },
  component: () => null,
});
