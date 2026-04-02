import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const recipesRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipes")
        .select(
          `
          id, title, description, servings, prep_time_minutes, cook_time_minutes,
          instructions, cuisine_type, meal_type, is_gluten_free, is_vegetarian,
          is_vegan, estimated_cost, image_url,
          recipe_ingredients (
            id, ingredient_name, quantity, unit, is_pantry_staple, estimated_cost
          )
        `
        )
        .eq("id", input.id)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });
      }
      return data;
    }),
});
