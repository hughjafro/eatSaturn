"use client";
import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/plan` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/plan` },
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-100">
        <Link href="/" className="text-xl font-bold text-green-700">
          CartSpoon
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in</h1>

        {sent ? (
          <div className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            Check your email — we sent a magic link to <strong>{email}</strong>
          </div>
        ) : (
          <>
            <button
              onClick={handleGoogle}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span>Continue with Google</span>
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleMagicLink} className="space-y-3">
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
                Send magic link
              </Button>
            </form>
          </>
        )}

        <p className="mt-4 text-center text-sm text-gray-500">
          No account?{" "}
          <Link href="/auth/signup" className="text-green-600 hover:underline">
            Sign up free
          </Link>
        </p>
      </div>
    </main>
  );
}
