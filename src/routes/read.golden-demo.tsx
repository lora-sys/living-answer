import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/read/golden-demo")({
  beforeLoad: ({ location }) => {
    if (location.pathname !== "/read/golden-demo") {
      return null;
    }

    throw redirect({
      to: "/read/golden-demo/chatgpt-free-plus",
    } as Parameters<typeof redirect>[0]);
  },
});
