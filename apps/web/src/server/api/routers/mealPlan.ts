import { z } from "zod";
import { TRPCError } from "@trpc/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import {
  createTRPCRouter,
  protectedProcedure,
  premiumProcedure,
} from "../trpc";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { getMondayOfCurrentWeek } from "@/lib/dates";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Zod schemas ──────────────────────────────────────────────────────────────

const MealSchema = z.object({
  recipe_id: z.string().uuid(),
  notes: z.string().optional().default(""),
});

const DaySchema = z.object({
  day: z.number().int().min(0).max(6),
  meals: z.object({
    breakfast: MealSchema,
    lunch: MealSchema,
    dinner: MealSchema,
  }),
});

const ClaudeResponseSchema = z.object({
  meal_plan: z.array(DaySchema).length(7),
  total_estimated_cost: z.number(),
  savings_vs_regular: z.number(),
  llm_summary: z.string(),
});

type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(storeIds: string[], weekOf: string, dietary: string[]): string {
  const raw = [...storeIds.sort(), weekOf, ...dietary.sort()].join("|");
  return `meal_plan:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

async function fetchMatchingRecipes(
  storeIds: string[],
  weekOf: string,
  dietary: { glutenFree: boolean; vegetarian: boolean; vegan: boolean }
) {
  const { data, error } = await supabaseAdmin.rpc(
    "get_recipes_matching_sale_items",
    {
      p_store_ids: storeIds,
      p_week_of: weekOf,
      p_gluten_free: dietary.glutenFree,
      p_vegetarian: dietary.vegetarian,
      p_vegan: dietary.vegan,
    }
  );
  if (error) throw new Error(`Recipe matching failed: ${error.message}`);
  return data ?? [];
}

async function fetchSaleItems(storeIds: string[], weekOf: string) {
  const { data, error } = await supabaseAdmin
    .from("sale_items")
    .select("product_name, category, sale_price, unit, normalized_name")
    .in("store_id", storeIds)
    .eq("week_of", weekOf)
    .limit(200);
  if (error) throw new Error(`Sale items fetch failed: ${error.message}`);
  return data ?? [];
}

async function callClaude(
  recipes: Awaited<ReturnType<typeof fetchMatchingRecipes>>,
  saleItems: Awaited<ReturnType<typeof fetchSaleItems>>,
  dietary: { glutenFree: boolean; vegetarian: boolean; vegan: boolean },
  householdSize: number,
  storeName: string,
  weekOf: string,
  model: string
): Promise<ClaudeResponse> {
  const systemPrompt = `You are a meal planning assistant for CartSpoon. Create a practical, budget-conscious 7-day meal plan using the provided sale items and recipe database.

RECIPE DATABASE (eligible recipes this week):
${JSON.stringify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recipes.slice(0, 200).map((r: any) => ({
    id: r.recipe_id,
    title: r.title,
    meal_type: r.meal_type,
    is_gluten_free: r.is_gluten_free,
    is_vegetarian: r.is_vegetarian,
    is_vegan: r.is_vegan,
    estimated_cost: r.estimated_cost,
    matched_sale_items: r.matched_items,
  })),
  null,
  0
)}

CONSTRAINTS:
- Return exactly 7 days (days 0-6), each with breakfast, lunch, and dinner
- Prioritize recipes with higher matched_sale_items counts
- Do not repeat the same recipe more than twice in the week
- Minimize total cost
- Return ONLY valid JSON matching this exact schema:
{
  "meal_plan": [{"day":0,"meals":{"breakfast":{"recipe_id":"uuid","notes":""},"lunch":{"recipe_id":"uuid","notes":""},"dinner":{"recipe_id":"uuid","notes":""}}},...],
  "total_estimated_cost": 0.00,
  "savings_vs_regular": 0.00,
  "llm_summary": "one paragraph"
}`;

  const userPrompt = `SALE ITEMS THIS WEEK (store: ${storeName}, week of ${weekOf}):
${JSON.stringify(saleItems.slice(0, 150), null, 0)}

HOUSEHOLD SIZE: ${householdSize}
DIETARY RESTRICTIONS: ${
    [
      dietary.glutenFree ? "gluten-free" : "",
      dietary.vegetarian ? "vegetarian" : "",
      dietary.vegan ? "vegan" : "",
    ]
      .filter(Boolean)
      .join(", ") || "none"
  }

Generate the meal plan JSON now.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: systemPrompt,
          // @ts-ignore — cache_control is valid in the API but not yet in SDK types
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: userPrompt },
      ],
    },
  ];

  const response = await anthropic.messages.create({
    model,
    max_tokens: model.includes("haiku") ? 1500 : 2500,
    messages,
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");

  // Strip markdown code fences if present
  const jsonText = content.text.replace(/```(?:json)?\n?/g, "").trim();

  return ClaudeResponseSchema.parse(JSON.parse(jsonText));
}

async function callClaudeWithRetry(
  ...args: Parameters<typeof callClaude>
): Promise<ClaudeResponse> {
  try {
    return await callClaude(...args);
  } catch (firstError) {
    // Single retry — append the parse error to give Claude a hint
    const errorHint = firstError instanceof Error ? firstError.message : String(firstError);
    const [recipes, saleItems, dietary, householdSize, storeName, weekOf, model] = args;
    try {
      return await callClaude(recipes, saleItems, dietary, householdSize, storeName, weekOf, model);
    } catch (secondError) {
      throw new Error(`Claude response invalid after retry: ${secondError}`);
    }
  }
}

async function writePlanToDb(
  userId: string,
  weekOf: string,
  storeIds: string[],
  claudeResponse: ClaudeResponse,
  model: string,
  isPremium: boolean
): Promise<string> {
  // Insert meal_plan
  const { data: plan, error: planError } = await supabaseAdmin
    .from("meal_plans")
    .insert({
      user_id: userId,
      week_of: weekOf,
      store_ids: storeIds,
      total_cost: claudeResponse.total_estimated_cost,
      is_premium_plan: isPremium,
      status: "active",
      llm_model_used: model,
      llm_summary: claudeResponse.llm_summary,
    })
    .select("id")
    .single();
  if (planError) throw new Error(`Failed to create meal plan: ${planError.message}`);

  const planId = plan.id;

  // Insert meal_plan_days
  const dayRows = claudeResponse.meal_plan.flatMap((day) =>
    (["breakfast", "lunch", "dinner"] as const).map((mealType) => ({
      meal_plan_id: planId,
      day_of_week: day.day,
      meal_type: mealType,
      recipe_id: day.meals[mealType].recipe_id,
      servings: 1,
      notes: day.meals[mealType].notes,
    }))
  );

  const { error: daysError } = await supabaseAdmin
    .from("meal_plan_days")
    .insert(dayRows);
  if (daysError) throw new Error(`Failed to insert meal plan days: ${daysError.message}`);

  // Create shopping list (items populated separately via a background process or inline)
  const { data: list, error: listError } = await supabaseAdmin
    .from("shopping_lists")
    .insert({
      meal_plan_id: planId,
      total_cost: claudeResponse.total_estimated_cost,
    })
    .select("id")
    .single();
  if (listError) throw new Error(`Failed to create shopping list: ${listError.message}`);

  return planId;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const mealPlanRouter = createTRPCRouter({
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    const user = ctx.user;
    const weekOf = getMondayOfCurrentWeek();
    const isPremium = user.tier === "premium";
    const model = isPremium ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

    // 1. Check if plan already exists this week
    const { data: existing } = await ctx.supabase
      .from("meal_plans")
      .select("id, week_of, llm_summary, total_cost")
      .eq("user_id", user.id)
      .eq("week_of", weekOf)
      .single();

    if (existing) return { planId: existing.id, cached: true };

    // 2. Get user's preferred stores
    const { data: prefs } = await ctx.supabase
      .from("user_preferences")
      .select("preferred_store_ids, dietary_restrictions")
      .eq("user_id", user.id)
      .single();

    const storeIds: string[] = prefs?.preferred_store_ids ?? [];
    if (storeIds.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Please select at least one preferred store before generating a plan.",
      });
    }

    // 3. Dietary flags (only applied if premium)
    const dietaryArr: string[] = isPremium ? (prefs?.dietary_restrictions ?? []) : [];
    const dietary = {
      glutenFree: dietaryArr.includes("gluten_free"),
      vegetarian: dietaryArr.includes("vegetarian"),
      vegan: dietaryArr.includes("vegan"),
    };

    // 4. Redis cache check
    const key = cacheKey(storeIds, weekOf, dietaryArr);
    const cachedPlanId = await redis.get<string>(key);
    if (cachedPlanId) {
      // Check if this cached plan belongs to this user (it might be shared if inputs match)
      const { data: planCheck } = await supabaseAdmin
        .from("meal_plans")
        .select("id")
        .eq("id", cachedPlanId)
        .eq("user_id", user.id)
        .single();
      if (planCheck) return { planId: cachedPlanId, cached: true };
    }

    // 5. Fetch sale items + matching recipes
    const [saleItems, recipes] = await Promise.all([
      fetchSaleItems(storeIds, weekOf),
      fetchMatchingRecipes(storeIds, weekOf, dietary),
    ]);

    if (recipes.length < 7) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Not enough recipes matched this week's sale items. Please try again later.",
      });
    }

    // 6. Fetch store name for the prompt
    const { data: storeData } = await supabaseAdmin
      .from("stores")
      .select("name")
      .in("id", storeIds);
    const storeName = storeData?.map((s) => s.name).join(" + ") ?? "your store";

    // 7. Call Claude
    const claudeResponse = await callClaudeWithRetry(
      recipes,
      saleItems,
      dietary,
      user.household_size,
      storeName,
      weekOf,
      model
    );

    // 8. Write to DB
    const planId = await writePlanToDb(
      user.id,
      weekOf,
      storeIds,
      claudeResponse,
      model,
      isPremium
    );

    // 9. Log LLM usage
    await supabaseAdmin.from("llm_usage_log").insert({
      model,
      input_tokens: 0, // Would be populated from response.usage if tracked
      output_tokens: 0,
      cached_tokens: 0,
      cost_usd: isPremium ? 0.006 : 0.001,
      user_tier: user.tier,
      meal_plan_id: planId,
    });

    // 10. Cache the plan ID
    await redis.set(key, planId, { ex: 60 * 60 * 24 * 7 }); // 7 days

    return { planId, cached: false };
  }),

  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const weekOf = getMondayOfCurrentWeek();

    const { data: plan, error } = await ctx.supabase
      .from("meal_plans")
      .select(
        `
        id, week_of, total_cost, llm_summary, store_ids, status,
        meal_plan_days (
          id, day_of_week, meal_type, notes, servings,
          recipe:recipe_id (
            id, title, description, meal_type, image_url, estimated_cost,
            is_gluten_free, is_vegetarian, is_vegan,
            recipe_ingredients (ingredient_name, quantity, unit, is_pantry_staple)
          )
        )
      `
      )
      .eq("user_id", ctx.user.id)
      .eq("week_of", weekOf)
      .single();

    if (error && error.code === "PGRST116") return null; // no plan yet
    if (error) throw new Error(error.message);
    return plan;
  }),

  getHistory: premiumProcedure
    .input(z.object({ page: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const PAGE_SIZE = 8;
      const { data, error, count } = await ctx.supabase
        .from("meal_plans")
        .select("id, week_of, total_cost, llm_summary, status", { count: "exact" })
        .eq("user_id", ctx.user.id)
        .order("week_of", { ascending: false })
        .range(input.page * PAGE_SIZE, (input.page + 1) * PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      return { plans: data ?? [], total: count ?? 0, page: input.page };
    }),
});
