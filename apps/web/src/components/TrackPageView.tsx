"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

interface TrackPageViewProps {
  event: string;
  properties?: Record<string, unknown>;
}

export function TrackPageView({ event, properties }: TrackPageViewProps) {
  const ph = usePostHog();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fire once on mount
  useEffect(() => {
    ph.capture(event, properties);
  }, []);

  return null;
}
