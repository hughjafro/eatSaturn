import { api } from "@/lib/trpc/server";
import { Badge } from "@/components/ui/Badge";
import Image from "next/image";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipePage({ params }: PageProps) {
  const { id } = await params;
  const recipe = await api.recipes.getById({ id });

  const totalTime =
    (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/plan" className="text-sm text-green-600 hover:underline">
        ← Back to plan
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">{recipe.title}</h1>

      {/* Meta badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {recipe.is_vegan && <Badge variant="green">Vegan</Badge>}
        {recipe.is_vegetarian && !recipe.is_vegan && (
          <Badge variant="green">Vegetarian</Badge>
        )}
        {recipe.is_gluten_free && <Badge variant="amber">Gluten-free</Badge>}
        {totalTime > 0 && (
          <Badge variant="gray">{totalTime} min total</Badge>
        )}
        {recipe.servings && (
          <Badge variant="gray">{recipe.servings} servings</Badge>
        )}
      </div>

      {recipe.image_url && (
        <div className="relative mt-5 h-64 w-full overflow-hidden rounded-2xl">
          <Image
            src={recipe.image_url}
            alt={recipe.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
      )}

      {recipe.description && (
        <p className="mt-5 text-gray-600">{recipe.description}</p>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {/* Ingredients */}
        <section>
          <h2 className="text-lg font-bold text-gray-900">Ingredients</h2>
          <ul className="mt-3 space-y-2">
            {recipe.recipe_ingredients?.map((ing) => (
              <li
                key={ing.id}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                {ing.quantity && (
                  <span className="font-medium">
                    {ing.quantity} {ing.unit}
                  </span>
                )}
                {ing.ingredient_name}
                {ing.is_pantry_staple && (
                  <span className="ml-auto text-xs text-gray-400">pantry</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Instructions */}
        <section>
          <h2 className="text-lg font-bold text-gray-900">Instructions</h2>
          <ol className="mt-3 space-y-3">
            {recipe.instructions?.map((step: string, i: number) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
