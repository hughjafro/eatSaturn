import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMondayOfCurrentWeek } from "@/lib/dates";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function checkAdminAccess() {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? headersList.get("x-real-ip") ?? "unknown";
  const allowedIps = (process.env.ADMIN_ALLOWED_IPS ?? "127.0.0.1").split(",");
  if (!allowedIps.includes(ip) && process.env.NODE_ENV === "production") {
    redirect("/");
  }
}

export default async function AdminPage() {
  await checkAdminAccess();

  const weekOf = getMondayOfCurrentWeek();
  const today = new Date().toISOString().split("T")[0];

  const [storesResult, llmResult, planCountResult] = await Promise.all([
    supabaseAdmin.from("stores").select("id, name, chain_key, is_active"),
    supabaseAdmin
      .from("llm_usage_log")
      .select("cost_usd, model, user_tier")
      .eq("logged_date", today),
    supabaseAdmin
      .from("meal_plans")
      .select("id", { count: "exact", head: true })
      .eq("week_of", weekOf),
  ]);

  const stores = storesResult.data ?? [];
  const llmLogs = llmResult.data ?? [];
  const totalLlmSpend = llmLogs.reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  // Sale item counts per store
  const saleCountPromises = stores.map((store) =>
    supabaseAdmin
      .from("sale_items")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .eq("week_of", weekOf)
      .then(({ count }) => ({ storeId: store.id, count: count ?? 0 }))
  );
  const saleCounts = await Promise.all(saleCountPromises);
  const saleCountMap = Object.fromEntries(
    saleCounts.map((s) => [s.storeId, s.count])
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
      <p className="text-sm text-gray-400">Week of {weekOf} · Today: {today}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">LLM spend today</p>
          <p className="text-2xl font-bold text-gray-900">${totalLlmSpend.toFixed(4)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Plans generated this week</p>
          <p className="text-2xl font-bold text-gray-900">{planCountResult.count ?? 0}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">LLM calls today</p>
          <p className="text-2xl font-bold text-gray-900">{llmLogs.length}</p>
        </div>
      </div>

      <h2 className="mt-8 font-semibold text-gray-900">Scraper Status — week of {weekOf}</h2>
      <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-400">Store</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-400">Status</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-400">Items this week</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const count = saleCountMap[store.id] ?? 0;
              const isHealthy = count >= 20;
              return (
                <tr key={store.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium">{store.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                        ${isHealthy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {isHealthy ? "OK" : "Low / missing"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
