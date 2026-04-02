import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import { type NextRequest } from "next/server";
import superjson from "superjson";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@/types/database";

// ── Context ─────────────────────────────────────────────────────────────────

export async function createTRPCContext(_opts: { req: NextRequest }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let dbUser: User | null = null;
  if (session?.user) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();
    dbUser = (data as User | null) ?? null;
  }

  return {
    supabase,
    session,
    user: dbUser,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

// ── Init ─────────────────────────────────────────────────────────────────────

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// ── Procedures ───────────────────────────────────────────────────────────────

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});

export const premiumProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.user.tier !== "premium") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This feature requires a premium subscription.",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});
