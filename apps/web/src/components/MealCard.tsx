import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface MealCardProps {
  recipeId: string;
  title: string;
  imageUrl?: string | null;
  estimatedCost?: number | null;
  mealType: string;
  onSaleIngredients?: string[];
  notes?: string | null;
}

export function MealCard({
  recipeId,
  title,
  imageUrl,
  estimatedCost,
  mealType,
  onSaleIngredients = [],
  notes,
}: MealCardProps) {
  return (
    <Link
      href={`/recipes/${recipeId}`}
      className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      {imageUrl && (
        <div className="relative mb-2 h-28 w-full overflow-hidden rounded-lg">
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 300px"
          />
        </div>
      )}
      <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{title}</p>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {estimatedCost != null && (
          <span className="text-xs text-gray-500">~${estimatedCost.toFixed(2)}</span>
        )}
        {onSaleIngredients.slice(0, 2).map((name) => (
          <Badge key={name} variant="green">
            {name} on sale
          </Badge>
        ))}
      </div>
      {notes && (
        <p className="mt-1 text-xs text-gray-500 italic line-clamp-1">{notes}</p>
      )}
    </Link>
  );
}
