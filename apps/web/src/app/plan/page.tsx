import { api } from "@/lib/trpc/server";
import { MealCard } from "@/components/MealCard";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;

export default async function PlanPage() {
  const plan = await api.mealPlan.getCurrent();

  if (!plan) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Your Weekly Plan</h1>
        <p className="mt-4 text-gray-500">
          You don't have a meal plan for this week yet.
        </p>
        <Link href="/plan/generate" className="mt-6 inline-block">
          <Button size="lg">Generate this week's plan</Button>
        </Link>
      </main>
    );
  }

  // Group days by day_of_week
  const byDay: Record<number, Record<string, (typeof plan.meal_plan_days)[0]>> =
    {};
  for (const entry of plan.meal_plan_days ?? []) {
    if (!byDay[entry.day_of_week]) byDay[entry.day_of_week] = {};
    byDay[entry.day_of_week][entry.meal_type] = entry;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Week's Plan</h1>
          <p className="text-sm text-gray-500">Week of {plan.week_of}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/shopping-list">
            <Button variant="outline">Shopping list</Button>
          </Link>
          <Link href="/plan/generate">
            <Button variant="secondary">Regenerate</Button>
          </Link>
        </div>
      </div>

      {plan.llm_summary && (
        <div className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          {plan.llm_summary}
        </div>
      )}

      {plan.total_cost && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
          Estimated weekly cost: ${plan.total_cost.toFixed(2)}
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => i).map((dayIdx) => (
          <div key={dayIdx} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400">
              {DAY_NAMES[dayIdx]}
            </p>
            <div className="space-y-2">
              {MEAL_TYPES.map((mt) => {
                const entry = byDay[dayIdx]?.[mt];
                const recipe = entry?.recipe as any;
                if (!entry || !recipe) {
                  return (
                    <div
                      key={mt}
                      className="h-16 rounded-lg border-2 border-dashed border-gray-100"
                    />
                  );
                }
                return (
                  <div key={mt}>
                    <p className="mb-1 text-xs font-semibold capitalize text-gray-400">
                      {mt}
                    </p>
                    <MealCard
                      recipeId={recipe.id}
                      title={recipe.title}
                      imageUrl={recipe.image_url}
                      estimatedCost={recipe.estimated_cost}
                      mealType={mt}
                      notes={entry.notes}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
