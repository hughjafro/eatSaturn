"use client";
import { trpc } from "@/lib/trpc/client";

const CHAIN_EMOJI: Record<string, string> = {
  kroger: "🛒",
  safeway: "🏪",
  aldi: "🛍️",
};

interface StoreSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function StoreSelector({ selectedIds, onChange }: StoreSelectorProps) {
  const { data: stores, isLoading } = trpc.stores.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 w-32 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    );
  }

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {stores?.map((store) => {
        const isSelected = selectedIds.includes(store.id);
        return (
          <button
            key={store.id}
            onClick={() => toggle(store.id)}
            className={`flex flex-col items-center rounded-xl border-2 px-5 py-3 transition-all
              ${
                isSelected
                  ? "border-green-600 bg-green-50 text-green-800"
                  : "border-gray-200 bg-white text-gray-600 hover:border-green-300"
              }`}
          >
            <span className="text-2xl">{CHAIN_EMOJI[store.chain_key] ?? "🏬"}</span>
            <span className="mt-1 text-sm font-semibold">{store.name}</span>
            {isSelected && (
              <span className="mt-1 text-xs text-green-600">Selected</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
