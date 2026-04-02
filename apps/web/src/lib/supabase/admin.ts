import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Never expose to the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseAdmin: SupabaseClient<any> = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
