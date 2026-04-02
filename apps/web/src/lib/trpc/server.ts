import "server-only";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cache } from "react";
import type { User } from "@/types/database";

const createContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let user: User | null = null;
  if (session?.user) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();
    user = (data as User | null) ?? null;
  }
  return { supabase, session, user };
});

const createCaller = createCallerFactory(appRouter);
export const api = createCaller(createContext);
