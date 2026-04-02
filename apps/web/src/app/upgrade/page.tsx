import Link from "next/link";
import { Button } from "@/components/ui/Button";

const FREE_FEATURES = [
  "Weekly sale items for 1 store",
  "1 meal plan per week",
  "Shopping list with cost estimate",
  "Preferred store saved",
];

const PREMIUM_FEATURES = [
  "Everything in Free",
  "Multi-store meal plans",
  "Dietary restriction filtering (GF, vegetarian, vegan)",
  "Household size scaling",
  "Plan history (past weeks)",
  "Weekly email delivery",
  "Extra plan regeneration",
];

export default function UpgradePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold text-gray-900">
          Upgrade to Premium
        </h1>
        <p className="mt-3 text-lg text-gray-500">
          Get personalized meal plans tailored to your diet and save even more.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-2xl border-2 border-gray-200 bg-white p-6">
          <h2 className="text-xl font-bold text-gray-900">Free</h2>
          <p className="mt-1 text-3xl font-extrabold text-gray-900">
            $0<span className="text-base font-medium text-gray-400">/mo</span>
          </p>
          <ul className="mt-5 space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-0.5 text-green-500">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <Link href="/auth/signup" className="mt-6 block">
            <Button variant="outline" className="w-full">Get started free</Button>
          </Link>
        </div>

        {/* Premium */}
        <div className="rounded-2xl border-2 border-green-500 bg-white p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Premium</h2>
            <span className="rounded-full bg-green-100 px-3 py-0.5 text-xs font-bold text-green-700">
              Most popular
            </span>
          </div>
          <p className="mt-1 text-3xl font-extrabold text-gray-900">
            $6.99<span className="text-base font-medium text-gray-400">/mo</span>
          </p>
          <ul className="mt-5 space-y-2">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-0.5 text-green-500">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <form action="/api/checkout" method="POST" className="mt-6">
            <button
              type="submit"
              className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700"
            >
              Upgrade now
            </button>
          </form>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-gray-400">
        Cancel anytime. No contracts.
      </p>
    </main>
  );
}
