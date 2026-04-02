import { PostHog } from "posthog-node";

// Server-side PostHog client (for tRPC/API routes)
export const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  flushAt: 1,
  flushInterval: 0, // Flush immediately in serverless environments
});
