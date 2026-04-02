"use client";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StoreSelector } from "@/components/StoreSelector";
import { trpc } from "@/lib/trpc/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [step, setStep] = useState<"email" | "store">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [error, setError] = useState("");

  const updatePrefs = trpc.user.updatePreferences.useMutation({
    onSuccess: () => router.push("/plan/generate"),
  });

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("store");
    }
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/plan` },
    });
  };

  const handleFinish = () => {
    if (selectedStores.length === 0) return;
    updatePrefs.mutate({ preferredStoreIds: selectedStores });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-100">
        <Link href="/" className="text-xl font-bold text-green-700">
          CartSpoon
        </Link>

        {step === "email" ? (
          <>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Create your free account
            </h1>
            <button
              onClick={handleGoogle}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <form onSubmit={handleSignup} className="space-y-3">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                Continue with email
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-green-600 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Which store do you shop at?
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              We'll pull deals from your chosen store each week.
            </p>
            <div className="mt-6">
              <StoreSelector
                selectedIds={selectedStores}
                onChange={setSelectedStores}
              />
            </div>
            <Button
              size="lg"
              className="mt-8 w-full"
              disabled={selectedStores.length === 0}
              loading={updatePrefs.isPending}
              onClick={handleFinish}
            >
              Build my first plan
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
