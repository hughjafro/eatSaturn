import { api } from "@/lib/trpc/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { PremiumGate } from "@/components/PremiumGate";

export default async function AccountPage() {
  const [profile, prefs] = await Promise.all([
    api.user.getProfile(),
    api.user.getPreferences(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Account</h1>

      {/* Tier */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={profile.tier === "premium" ? "green" : "gray"}>
                {profile.tier === "premium" ? "Premium" : "Free plan"}
              </Badge>
            </div>
          </div>
          {profile.tier !== "premium" && (
            <Link
              href="/upgrade"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Upgrade
            </Link>
          )}
        </div>
      </section>

      {/* Store preferences */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <h2 className="font-semibold text-gray-900">Preferred stores</h2>
        <p className="mt-1 text-sm text-gray-500">
          {prefs.preferred_store_ids.length} store(s) selected
        </p>
        <Link href="/account/stores" className="mt-3 inline-block text-sm text-green-600 hover:underline">
          Change stores
        </Link>
      </section>

      {/* Premium features */}
      <section className="mt-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Dietary preferences</h2>
        {profile.tier === "premium" ? (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">
              Dietary restrictions:{" "}
              {prefs.dietary_restrictions.length > 0
                ? prefs.dietary_restrictions.join(", ")
                : "none set"}
            </p>
          </div>
        ) : (
          <PremiumGate featureName="Dietary restrictions">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-100">
              <p className="text-sm text-gray-400">Gluten-free, vegetarian, vegan...</p>
            </div>
          </PremiumGate>
        )}
      </section>
    </main>
  );
}
