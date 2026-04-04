# Meal Plan Algorithm

> Documents the full meal plan generation process, Claude prompt strategy,
> caching behavior, and quality controls. Reference this whenever modifying
> `apps/web/src/server/api/routers/mealPlan.ts`.

---

## End-to-End Flow

```
mealPlan.generate (tRPC mutation)
         │
         ├─ 1. Idempotency check
         │      Does a plan exist for (user_id, week_of)?
         │      YES → return existing plan_id, cached: true
         │      NO  → continue
         │
         ├─ 2. Load user context
         │      preferred_store_ids from user_preferences
         │      dietary_restrictions (premium only)
         │
         ├─ 3. Redis cache check
         │      key = sha256(storeIds + weekOf + dietary)[:16]
         │      HIT + plan belongs to user → return plan_id, cached: true
         │      MISS → continue
         │
         ├─ 4. Fetch data (parallel)
         │      ├─ sale_items (limit 150, this week, user's stores)
         │      └─ get_recipes_matching_sale_items() (limit 200)
         │
         ├─ 5. Guard: < 7 recipes → throw PRECONDITION_FAILED
         │
         ├─ 6. Call Claude API
         │      Model: haiku (free) / sonnet (premium)
         │      Parse + validate with ClaudeResponseSchema (Zod)
         │      Retry once on failure
         │
         ├─ 7. Write to database
         │      INSERT meal_plans
         │      INSERT meal_plan_days (21 rows)
         │      INSERT shopping_lists
         │
         ├─ 8. Post-generation
         │      Log to llm_usage_log
         │      Cache plan_id in Redis (TTL: 7 days)
         │      Capture PostHog event
         │
         └─ 9. Return { planId, cached: false }
```

---

## Claude Prompt Architecture

### Model Selection

| User Tier | Model | max_tokens | Est. Cost/Plan |
|---|---|---|---|
| Free | `claude-haiku-4-5-20251001` | 1,500 | ~$0.001 |
| Premium | `claude-sonnet-4-6` | 2,500 | ~$0.006 |

### Message Structure

```typescript
messages: [
  {
    role: "user",
    content: [
      {
        type: "text",
        text: systemPrompt,          // ← CACHED (ephemeral)
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: userPrompt             // ← NOT cached (dynamic per user/week)
      }
    ]
  }
]
```

### System Prompt (cached, static per week)

```
You are a meal planning assistant for CartSpoon. Create a practical,
budget-conscious 7-day meal plan using the provided sale items and
recipe database.

RECIPE DATABASE (eligible recipes this week):
[JSON array — top 200 matched recipes with fields:
  id, title, meal_type, is_gluten_free, is_vegetarian, is_vegan,
  estimated_cost, matched_sale_items count]

CONSTRAINTS:
- Return exactly 7 days (days 0-6), each with breakfast, lunch, dinner
- Prioritize recipes with higher matched_sale_items counts
- Do not repeat the same recipe more than twice in the week
- Minimize total cost
- Return ONLY valid JSON matching this exact schema:
{
  "meal_plan": [{"day":0,"meals":{"breakfast":{"recipe_id":"uuid","notes":""},...}},...],
  "total_estimated_cost": 0.00,
  "savings_vs_regular": 0.00,
  "llm_summary": "one paragraph"
}
```

### User Prompt (dynamic, not cached)

```
SALE ITEMS THIS WEEK (store: {storeName}, week of {weekOf}):
[JSON array — top 150 sale items with fields:
  product_name, category, sale_price, unit, normalized_name]

HOUSEHOLD SIZE: {householdSize}
DIETARY RESTRICTIONS: {dietary or "none"}

Generate the meal plan JSON now.
```

### Token Budget

| Section | Target | Notes |
|---|---|---|
| Recipe DB (system) | ~2,500–3,000 tokens | Trimmed to 5 fields per recipe |
| Constraints (system) | ~200 tokens | Keep concise |
| Sale items (user) | ~1,200–1,500 tokens | 150 items × ~10 tokens |
| User context (user) | ~50 tokens | household_size, dietary, store, week |
| Output | 1,500 / 2,500 tokens | 21 meals × ~50 tokens + summary |

---

## Prompt Caching

### How It Works
Anthropic caches the first content block (system prompt) when it exceeds
**1,024 tokens** and includes `cache_control: { type: "ephemeral" }`.
Cache lifetime: 5 minutes (resets on each cache hit).

### Why It Matters for CartSpoon
The recipe DB section alone is ~2,500–3,000 tokens. Without caching, every
plan generation re-processes that entire block. With caching, the first
call in a 5-minute window pays full price; subsequent calls within the
window get cached input tokens billed at 10% of normal rate.

**For free users (haiku):** Cache saves ~$0.0003/plan
**For premium users (sonnet):** Cache saves ~$0.004/plan

### Verifying Cache is Active
```typescript
// Check response.usage after each call
const response = await anthropic.messages.create({ ... });
console.log(response.usage);
// {
//   input_tokens: 500,        // dynamic (user prompt)
//   cache_creation_input_tokens: 3000,  // first call: cache being written
//   cache_read_input_tokens: 3000,      // subsequent calls: cache being read
//   output_tokens: 650
// }
```

Cache is **not working** if `cache_read_input_tokens` is consistently 0.
Check that `cache_control` is still on `content[0]` in the message.

### Cache Invalidation
The cache invalidates automatically when the system prompt content changes.
This happens weekly when the recipe DB (matched recipes for the new week)
is recalculated. The first plan generated each week pays full input price;
all subsequent plans that week benefit from caching.

---

## Output Schema

Validated by `ClaudeResponseSchema` (Zod) in `mealPlan.ts`:

```typescript
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
  meal_plan: z.array(DaySchema).length(7),   // exactly 7 days
  total_estimated_cost: z.number(),
  savings_vs_regular: z.number(),
  llm_summary: z.string(),
});
```

### JSON Fence Stripping
Claude occasionally wraps output in markdown fences. Always strip before parsing:
```typescript
const jsonText = content.text.replace(/```(?:json)?\n?/g, "").trim();
```

---

## Retry Strategy

`callClaudeWithRetry()` wraps `callClaude()` with exactly one retry:

```
Attempt 1: callClaude()
  ├─ Success → return ClaudeResponse
  └─ Failure (parse error, schema error, API error)
       │
       Attempt 2: callClaude() again (same inputs)
         ├─ Success → return ClaudeResponse
         └─ Failure → throw Error("Claude response invalid after retry: ...")
```

**One retry only.** More retries amplify cost on a bad prompt; fix the
prompt instead of adding retries.

---

## Recipe Matching

`get_recipes_matching_sale_items()` (Postgres function) joins recipes to
this week's sale items via pg_trgm similarity on `normalized_name`.

```sql
-- Simplified
JOIN sale_items si
  ON si.store_id = ANY(p_store_ids)
 AND si.week_of = p_week_of
 AND similarity(ri.normalized_name, si.normalized_name) >= 0.4
WHERE ri.is_pantry_staple = false
  AND [dietary filters if set]
GROUP BY recipe
ORDER BY matched_items DESC, estimated_cost ASC
LIMIT 200
```

**Pantry staples** (salt, pepper, oil, flour, etc.) are excluded from
matching — they're assumed always available and don't drive recipe selection.

**Minimum threshold:** 7 matched recipes required before Claude is called.
Below this, throw `PRECONDITION_FAILED`. This usually means scrapers failed
to run this week — check scraper health first.

---

## Rate Limiting

Enforced via Upstash Redis + `@upstash/ratelimit`:

| Tier | Limit | Window | Redis prefix |
|---|---|---|---|
| Free | 1 plan | 7 days (604,800s) | `rl:plan:free` |
| Premium | 2 plans | 7 days | `rl:plan:premium` |

Rate limit is checked implicitly — the DB uniqueness constraint
`UNIQUE(user_id, week_of)` on `meal_plans` enforces the limit at the
data layer even if Redis is bypassed.

---

## Database Writes

Three tables are written atomically (sequential inserts, not a transaction —
if shopping_list insert fails, meal_plan and meal_plan_days still persist):

```
meal_plans (1 row)
  id, user_id, week_of, store_ids, total_cost,
  is_premium_plan, llm_model_used, llm_summary

meal_plan_days (21 rows)
  meal_plan_id, day_of_week (0-6), meal_type (breakfast/lunch/dinner),
  recipe_id, servings (default 1), notes

shopping_lists (1 row)
  meal_plan_id, total_cost
  [items populated separately — currently a placeholder]
```

---

## Quality Targets

| Metric | Target | How to Measure |
|---|---|---|
| Parse success rate | > 98% | `retry_count / total_calls` in logs |
| Recipe diversity | ≥ 18 unique recipes per plan | Count distinct recipe_ids per plan |
| Sale item coverage | ≥ 60% of recipes have ≥1 matched sale item | QA agent query |
| Cost accuracy | Within 20% of actual shopping cost | User feedback / spot checks |
| Dietary compliance | 100% for premium with restrictions | QA agent query |

---

## Known Edge Cases

**< 7 matched recipes:** Scrapers may have failed. Check sale_items for
this week before debugging the prompt. Run `/scrape --check`.

**Claude returns invalid recipe_id:** The recipe was in the DB when the
prompt was built but was deleted mid-generation (extremely rare). The Zod
UUID validation catches this; the retry usually resolves it.

**savings_vs_regular = 0:** Claude isn't calculating the delta. Strengthen
the prompt: add an explicit instruction to sum `(regular_price - sale_price)`
per matched ingredient across all 21 meals.

**llm_summary too short:** Add minimum length requirement to prompt:
"Write a 2–3 sentence summary mentioning the store name, key deals used,
and estimated total savings."
