import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-xl font-bold text-green-700">
            CartSpoon
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-green-50 to-amber-50 px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-green-600">
            Save money every week
          </p>
          <h1 className="mt-4 text-5xl font-extrabold tracking-tight text-gray-900">
            Meal plans built around{" "}
            <span className="text-green-600">this week's deals</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600">
            CartSpoon scans your local store's weekly sales ad and builds you
            a personalized 7-day meal plan with recipes, a shopping list, and
            cost estimates — automatically.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg">Build my meal plan — free</Button>
            </Link>
            <Link href="/sale-items">
              <Button size="lg" variant="outline">
                See this week's deals
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-gray-900">How it works</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            {
              step: "1",
              icon: "🛒",
              title: "We scan the sales",
              desc: "Every week we automatically pull the latest deals from Kroger, Safeway, and Aldi.",
            },
            {
              step: "2",
              icon: "🤖",
              title: "AI builds your plan",
              desc: "Our AI matches sale items to recipes and creates a 7-day plan that maximizes your savings.",
            },
            {
              step: "3",
              icon: "📋",
              title: "Shop & cook",
              desc: "Get a categorized shopping list with prices, then follow simple step-by-step recipes.",
            },
          ].map(({ step, icon, title, desc }) => (
            <div
              key={step}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-2xl">
                {icon}
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported stores */}
      <section className="bg-white py-12">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            Supported stores
          </p>
          <div className="mt-6 flex items-center justify-center gap-10 text-3xl">
            <span title="Kroger">🛒 Kroger</span>
            <span title="Safeway">🏪 Safeway</span>
            <span title="Aldi">🛍️ Aldi</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-700 px-4 py-16 text-center text-white">
        <h2 className="text-3xl font-bold">Start saving this week</h2>
        <p className="mt-3 text-green-100">
          Free forever for one store. Upgrade for dietary filters, multi-store plans, and more.
        </p>
        <Link href="/auth/signup" className="mt-8 inline-block">
          <Button
            size="lg"
            className="bg-white text-green-700 hover:bg-green-50"
          >
            Create a free account
          </Button>
        </Link>
      </section>

      <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} CartSpoon
      </footer>
    </main>
  );
}
