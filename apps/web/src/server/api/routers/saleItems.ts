import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { getMondayOfCurrentWeek } from "@/lib/dates";

export const saleItemsRouter = createTRPCRouter({
  getCurrentWeek: publicProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const weekOf = getMondayOfCurrentWeek();

      const { data, error } = await ctx.supabase
        .from("sale_items")
        .select(
          "id, product_name, category, unit, sale_price, regular_price, discount_pct, image_url, normalized_name"
        )
        .eq("store_id", input.storeId)
        .eq("week_of", weekOf)
        .order("category", { ascending: true })
        .order("discount_pct", { ascending: false });

      if (error) throw new Error(error.message);

      // Group by category
      const grouped: Record<string, typeof data> = {};
      for (const item of data ?? []) {
        const cat = item.category ?? "other";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      }

      return { weekOf, items: data ?? [], grouped };
    }),
});
