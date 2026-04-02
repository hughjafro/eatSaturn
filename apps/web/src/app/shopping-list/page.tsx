import { api } from "@/lib/trpc/server";
import { ShoppingList } from "@/components/ShoppingList";
import { TrackPageView } from "@/components/TrackPageView";
import Link from "next/link";

export default async function ShoppingListPage() {
  const plan = await api.mealPlan.getCurrent();

  if (!plan) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-gray-500">No plan this week yet.</p>
        <Link href="/plan/generate" className="mt-4 inline-block text-green-600 hover:underline">
          Generate a plan first
        </Link>
      </main>
    );
  }

  // Fetch shopping list items via Supabase directly would go here
  // For now render the plan structure as a placeholder
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shopping List</h1>
        <Link href="/plan" className="text-sm text-green-600 hover:underline">
          Back to plan
        </Link>
      </div>
      <TrackPageView event="shopping_list_opened" />
      <ShoppingList items={[]} totalCost={plan.total_cost} />
    </main>
  );
}
