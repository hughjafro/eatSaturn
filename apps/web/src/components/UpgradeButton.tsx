"use client";

import { usePostHog } from "posthog-js/react";

export function UpgradeButton() {
  const ph = usePostHog();

  return (
    <form action="/api/checkout" method="POST" className="mt-6">
      <button
        type="submit"
        onClick={() => ph.capture("upgrade_clicked", { source: "upgrade_page" })}
        className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700"
      >
        Upgrade now
      </button>
    </form>
  );
}
