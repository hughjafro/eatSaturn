import { api } from "@/lib/trpc/server";
import { Badge } from "@/components/ui/Badge";

interface PageProps {
  searchParams: Promise<{ store?: string }>;
}

export default async function SaleItemsPage({ searchParams }: PageProps) {
  const { store: storeId } = await searchParams;

  // If no store selected, show store picker
  if (!storeId) {
    const stores = await api.stores.list();
    return (
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900">This Week's Deals</h1>
        <p className="mt-2 text-gray-500">Select a store to see current sales</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {stores.map((store) => (
            <a
              key={store.id}
              href={`/sale-items?store=${store.id}`}
              className="rounded-2xl border-2 border-gray-200 bg-white p-6 text-center hover:border-green-500 transition-colors"
            >
              <p className="text-3xl">{store.chain_key === "kroger" ? "🛒" : store.chain_key === "safeway" ? "🏪" : "🛍️"}</p>
              <p className="mt-2 font-bold text-gray-900">{store.name}</p>
            </a>
          ))}
        </div>
      </main>
    );
  }

  const { weekOf, grouped } = await api.saleItems.getCurrentWeek({ storeId });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">This Week's Deals</h1>
          <p className="text-sm text-gray-500">Week of {weekOf}</p>
        </div>
        <a href="/sale-items" className="text-sm text-green-600 hover:underline">
          Change store
        </a>
      </div>

      <div className="space-y-8">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">
              {category}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items?.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
                >
                  <p className="font-semibold text-gray-800">{item.product_name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {item.sale_price != null && (
                      <span className="text-lg font-bold text-green-700">
                        ${item.sale_price.toFixed(2)}
                        {item.unit && <span className="text-sm font-normal">/{item.unit}</span>}
                      </span>
                    )}
                    {item.regular_price != null && (
                      <span className="text-sm text-gray-400 line-through">
                        ${item.regular_price.toFixed(2)}
                      </span>
                    )}
                    {item.discount_pct != null && item.discount_pct > 0 && (
                      <Badge variant="green">{Math.round(item.discount_pct)}% off</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
