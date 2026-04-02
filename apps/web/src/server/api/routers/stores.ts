import { createTRPCRouter, publicProcedure } from "../trpc";

export const storesRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("stores")
      .select("id, name, chain_key, is_active")
      .eq("is_active", true)
      .order("name");

    if (error) throw new Error(error.message);
    return data;
  }),
});
