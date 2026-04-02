"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";

interface ShoppingItem {
  id: string;
  ingredient_name: string;
  quantity?: number | null;
  unit?: string | null;
  on_sale: boolean;
  sale_price?: number | null;
  regular_price?: number | null;
  aisle_category?: string | null;
}

interface ShoppingListProps {
  items: ShoppingItem[];
  totalCost?: number | null;
}

export function ShoppingList({ items, totalCost }: ShoppingListProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Group by aisle
  const grouped: Record<string, ShoppingItem[]> = {};
  for (const item of items) {
    const cat = item.aisle_category ?? "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  return (
    <div className="space-y-5">
      {totalCost != null && (
        <div className="rounded-xl bg-green-50 px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-semibold text-green-800">
            Estimated total
          </span>
          <span className="text-xl font-bold text-green-700">
            ${totalCost.toFixed(2)}
          </span>
        </div>
      )}

      {Object.entries(grouped).map(([category, catItems]) => (
        <div key={category}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            {category}
          </h3>
          <ul className="space-y-2">
            {catItems.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(item.id)}
                    className="mt-0.5 h-4 w-4 accent-green-600 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${isChecked ? "line-through text-gray-400" : "text-gray-800"}`}
                    >
                      {item.quantity && `${item.quantity} ${item.unit ?? ""} `}
                      {item.ingredient_name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {item.on_sale && item.sale_price != null && (
                        <Badge variant="green">
                          ${item.sale_price.toFixed(2)} sale
                        </Badge>
                      )}
                      {item.regular_price != null && item.on_sale && (
                        <span className="text-xs text-gray-400 line-through">
                          ${item.regular_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
