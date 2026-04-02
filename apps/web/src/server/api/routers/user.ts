import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  premiumProcedure,
} from "../trpc";

export const userRouter = createTRPCRouter({
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", ctx.user.id)
      .single();

    if (error && error.code !== "PGRST116") throw new Error(error.message);

    // Return defaults if no preferences row yet
    return (
      data ?? {
        user_id: ctx.user.id,
        preferred_store_ids: [],
        dietary_restrictions: [],
        disliked_ingredients: [],
        cuisine_preferences: [],
        notification_day: "sunday",
      }
    );
  }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        preferredStoreIds: z.array(z.string().uuid()).optional(),
        // Premium-only fields:
        dietaryRestrictions: z.array(z.string()).optional(),
        dislikedIngredients: z.array(z.string()).optional(),
        cuisinePreferences: z.array(z.string()).optional(),
        notificationDay: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isPremium = ctx.user.tier === "premium";

      // Block free users from writing premium fields
      if (!isPremium) {
        if (
          input.dietaryRestrictions !== undefined ||
          input.dislikedIngredients !== undefined ||
          input.cuisinePreferences !== undefined
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Dietary preferences require a premium subscription.",
          });
        }
      }

      const updatePayload: Record<string, unknown> = {
        user_id: ctx.user.id,
      };
      if (input.preferredStoreIds !== undefined)
        updatePayload.preferred_store_ids = input.preferredStoreIds;
      if (isPremium) {
        if (input.dietaryRestrictions !== undefined)
          updatePayload.dietary_restrictions = input.dietaryRestrictions;
        if (input.dislikedIngredients !== undefined)
          updatePayload.disliked_ingredients = input.dislikedIngredients;
        if (input.cuisinePreferences !== undefined)
          updatePayload.cuisine_preferences = input.cuisinePreferences;
      }
      if (input.notificationDay !== undefined)
        updatePayload.notification_day = input.notificationDay;

      const { data, error } = await ctx.supabase
        .from("user_preferences")
        .upsert(updatePayload, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      tier: ctx.user.tier,
      householdSize: ctx.user.household_size,
    };
  }),
});
