"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/Button";

const LOADING_MESSAGES = [
  "Scanning this week's deals...",
  "Matching ingredients to recipes...",
  "Building your personalized plan...",
  "Calculating savings...",
  "Almost there...",
];

export default function GeneratePage() {
  const router = useRouter();
  const [messageIdx, setMessageIdx] = useState(0);

  const generate = trpc.mealPlan.generate.useMutation({
    onSuccess: () => router.push("/plan"),
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const handleGenerate = () => {
    generate.mutate();
    // Cycle through loading messages
    const interval = setInterval(() => {
      setMessageIdx((i) => {
        if (i >= LOADING_MESSAGES.length - 1) {
          clearInterval(interval);
          return i;
        }
        return i + 1;
      });
    }, 2500);
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="text-6xl">🥗</div>
      <h1 className="mt-4 text-3xl font-bold text-gray-900">
        Generate This Week's Plan
      </h1>
      <p className="mt-3 text-gray-500">
        We'll scan your store's current sales and build you a 7-day meal plan
        optimized for savings.
      </p>

      {generate.isPending ? (
        <div className="mt-10">
          <div className="flex justify-center">
            <svg
              className="h-10 w-10 animate-spin text-green-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-green-700">
            {LOADING_MESSAGES[messageIdx]}
          </p>
        </div>
      ) : (
        <Button
          size="lg"
          className="mt-10"
          onClick={handleGenerate}
        >
          Build my plan
        </Button>
      )}
    </main>
  );
}
