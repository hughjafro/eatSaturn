# Skill: Meal Plan Optimization

> Systematic process for improving CartSpoon's Claude meal plan quality,
> reducing token costs, and fixing prompt failures. Treat the prompt
> as production code — change one variable at a time, measure, decide.

---

## When to Use This Skill

- Users report repetitive or low-quality meal plans
- Parse failure rate rises above 2%
- `savings_vs_regular` consistently returns 0
- LLM cost per plan increases unexpectedly
- Cache hit rate drops below 20%
- Adding a new dietary restriction type
- Preparing for a model version upgrade (haiku → new haiku, etc.)

---

## Phase 1: Baseline Measurement

Before changing anything, establish what's currently happening.

### 1.1 Pull Recent Production Data

```sql
-- Last 7 days of plan generation stats
SELECT
  logged_date,
  model,
  COUNT(*)                                              AS calls,
  ROUND(AVG(input_tokens)::numeric, 0)                  AS avg_input,
  ROUND(AVG(cached_tokens)::numeric, 0)                 AS avg_cached,
  ROUND(
    AVG(cached_tokens)::numeric /
    NULLIF(AVG(input_tokens), 0) * 100, 1
  )                                                     AS cache_hit_pct,
  ROUND(AVG(output_tokens)::numeric, 0)                 AS avg_output,
  ROUND(AVG(cost_usd)::numeric, 6)                      AS avg_cost
FROM llm_usage_log
WHERE logged_date >= CURRENT_DATE - 7
GROUP BY logged_date, model
ORDER BY logged_date DESC, model;
```

### 1.2 Check Plan Quality Metrics

```sql
-- Recipe diversity: unique recipes per plan (target >= 18)
WITH plan_diversity AS (
  SELECT
    meal_plan_id,
    COUNT(DISTINCT recipe_id) AS unique_recipes
  FROM meal_plan_days mpd
  JOIN meal_plans mp ON mp.id = mpd.meal_plan_id
  WHERE mp.created_at >= NOW() - INTERVAL '7 days'
  GROUP BY meal_plan_id
)
SELECT
  AVG(unique_recipes)::numeric(4,1) AS avg_unique_recipes,
  MIN(unique_recipes)               AS min_unique_recipes,
  COUNT(*) FILTER (WHERE unique_recipes < 18) AS plans_below_target
FROM plan_diversity;

-- Sale item coverage (target >= 60%)
WITH coverage AS (
  SELECT
    mp.id,
    COUNT(DISTINCT mpd.recipe_id)                            AS total_recipes,
    COUNT(DISTINCT CASE WHEN ri_match.recipe_id IS NOT NULL
                        THEN mpd.recipe_id END)              AS matched_recipes
  FROM meal_plans mp
  JOIN meal_plan_days mpd ON mpd.meal_plan_id = mp.id
  LEFT JOIN (
    SELECT DISTINCT ri.recipe_id
    FROM recipe_ingredients ri
    JOIN sale_items si
      ON similarity(ri.normalized_name, si.normalized_name) >= 0.4
     AND ri.is_pantry_staple = false
  ) ri_match ON ri_match.recipe_id = mpd.recipe_id
  WHERE mp.created_at >= NOW() - INTERVAL '7 days'
  GROUP BY mp.id
)
SELECT
  ROUND(AVG(matched_recipes::numeric / NULLIF(total_recipes, 0) * 100), 1) AS avg_coverage_pct
FROM coverage;
```

### 1.3 Record Baseline

Document before making any changes:
```
Date: YYYY-MM-DD
Avg input tokens: ____
Avg cached tokens: ____ (cache hit rate: ___%)
Avg output tokens: ____
Avg cost/plan (haiku): $____
Avg cost/plan (sonnet): $____
Avg unique recipes/plan: ____
Avg sale item coverage: ____%
Parse failure rate: ___% (estimate from retry logs)
```

---

## Phase 2: Identify the Problem

### Parse Failures (JSON invalid or schema mismatch)

**Symptom:** Users see "Internal server error" when generating plans.
**Diagnosis:** Add temporary logging to `callClaude()`:
```typescript
} catch (err) {
  console.error("Raw Claude response:", content.text.slice(0, 500));
  throw err;
}
```

**Common causes:**
| Raw Output Pattern | Fix |
|---|---|
| Starts with explanation text, then JSON | Add "Return ONLY valid JSON" at end of system prompt |
| Wrapped in ` ```json ``` ` fences | Already handled by fence-stripping — check strip logic |
| `recipe_id` is a title string not a UUID | Add "recipe_id must be the UUID from the RECIPE DATABASE" |
| Array has 6 or 8 days | Add "Return EXACTLY 7 items in meal_plan, one per day 0-6" |
| Missing a meal slot | Add "Every day must have breakfast, lunch, AND dinner" |

### Recipe Duplication

**Symptom:** Same recipe appears 3+ times in a plan.
**Diagnosis:**
```sql
SELECT mpd.recipe_id, r.title, COUNT(*) AS appearances
FROM meal_plan_days mpd
JOIN recipes r ON r.id = mpd.recipe_id
JOIN meal_plans mp ON mp.id = mpd.meal_plan_id
WHERE mp.created_at >= NOW() - INTERVAL '7 days'
GROUP BY mpd.recipe_id, r.title
HAVING COUNT(*) > 2
ORDER BY appearances DESC LIMIT 10;
```

**Fix:** Strengthen the constraint in the system prompt:
```
STRICT RULE: Do not use the same recipe_id more than twice across all 21 meals.
```

### Low Sale Item Coverage

**Symptom:** Plans don't reflect this week's deals.
**Diagnosis:** Check `matched_items` scores in the recipe DB passed to Claude.
If most recipes have `matched_items: 0`, the scraper may have failed.

**Fix options:**
1. If scrapers are healthy: lower similarity threshold in `get_recipes_matching_sale_items()` from 0.4 to 0.35
2. Add more synonyms to `ingredient_synonyms` table
3. Strengthen prompt instruction: "You MUST prioritize recipes with matched_sale_items > 0"

### savings_vs_regular Always 0

**Symptom:** `savings_vs_regular` in plan is 0 even when deals are loaded.
**Fix:** Add explicit instruction to system prompt:
```
For savings_vs_regular: sum the difference between regular_price and
sale_price for each matched sale item used across all 21 meals.
If regular_price is not available, estimate 30% above sale_price.
```

### High Token Cost

**Symptom:** Cost per plan increases over time.
**Diagnosis:** Check if recipe list or sale items list grew.
```typescript
// Add temporary logging in mealPlan.ts:
console.log("Recipe count:", recipes.length);
console.log("Sale item count:", saleItems.length);
console.log("System prompt chars:", systemPrompt.length);
console.log("User prompt chars:", userPrompt.length);
```

**Fix options:**
1. Trim recipe fields: remove `description`, `cuisine_type` — keep only `id, title, meal_type, matched_items, estimated_cost`
2. Trim sale item fields: keep only `normalized_name, category, sale_price, unit`
3. Reduce recipe DB to 150 (from 200)
4. Reduce sale items to 100 (from 150)

---

## Phase 3: Write the Fix

### Prompt Change Rules
1. **One variable at a time** — never change system prompt AND user prompt in the same test
2. **Be specific, not vague** — "Return exactly 7" not "Return the correct number"
3. **Constraints go at the end** — Claude gives more weight to end-of-prompt instructions
4. **Schema is non-negotiable** — never change the JSON shape; update `ClaudeResponseSchema` if needed

### System Prompt Template
```typescript
const systemPrompt = `You are a meal planning assistant for CartSpoon.
Create a practical, budget-conscious 7-day meal plan using the provided
sale items and recipe database.

RECIPE DATABASE (eligible recipes this week):
${JSON.stringify(recipes.slice(0, 200).map(r => ({
  id: r.recipe_id,
  title: r.title,
  meal_type: r.meal_type,
  is_gluten_free: r.is_gluten_free,
  is_vegetarian: r.is_vegetarian,
  is_vegan: r.is_vegan,
  estimated_cost: r.estimated_cost,
  matched_sale_items: r.matched_items,
})), null, 0)}

CONSTRAINTS:
- Return EXACTLY 7 days (days 0-6), each with breakfast, lunch, and dinner
- STRICT RULE: Do not use the same recipe_id more than twice across all 21 meals
- Prioritize recipes with higher matched_sale_items counts — use at least 12 recipes with matched_sale_items > 0
- Minimize total_estimated_cost
- For savings_vs_regular: sum (regular_price - sale_price) for all matched sale items used
- Return ONLY valid JSON matching this exact schema — no explanation, no markdown:
{
  "meal_plan": [{"day":0,"meals":{"breakfast":{"recipe_id":"uuid","notes":""},"lunch":{"recipe_id":"uuid","notes":""},"dinner":{"recipe_id":"uuid","notes":""}}},...],
  "total_estimated_cost": 0.00,
  "savings_vs_regular": 0.00,
  "llm_summary": "2-3 sentence summary mentioning store name, key sale items used, and estimated savings"
}`;
```

---

## Phase 4: Test the Change

### 4.1 Run /test-meal-plan

Use the command 3 times with different store/dietary combinations:
```
/test-meal-plan  (free user, single store)
/test-meal-plan  (premium user, multi-store, gluten-free)
/test-meal-plan  (premium user, vegan)
```

### 4.2 Measure Against Baseline

For each test run, record:
```
Parse success: Y/N
Unique recipes: __/21
Recipes with sale matches: __/21
savings_vs_regular > 0: Y/N
Input tokens: ____
Cached tokens: ____
Output tokens: ____
Estimated cost: $____
```

### 4.3 Decision Criteria

**Ship the change if:**
- Parse success rate: 3/3 runs successful
- Unique recipes: ≥ 18 in all runs
- Sale coverage: ≥ 60% in all runs
- Cost: ≤ baseline or within 10% of baseline

**Revert the change if:**
- Any parse failures
- Unique recipes < 16 in any run
- Cost > 20% above baseline

---

## Phase 5: Cache Health Check

After any prompt change, verify prompt caching still works.

### Check Cache Tokens in Response
Add temporary logging in `callClaude()`:
```typescript
console.log("Usage:", response.usage);
// Should show: cache_creation_input_tokens OR cache_read_input_tokens > 0
// If both are 0: caching is broken
```

### Minimum Cache Requirements
- System prompt must exceed **1,024 tokens** (Anthropic minimum)
- `cache_control: { type: "ephemeral" }` must be on `content[0]`
- The content of `content[0]` must be identical across calls for cache to hit

### If Cache is Broken
1. Verify `cache_control` is still on the content block (not removed accidentally)
2. Check system prompt length: `systemPrompt.length` should be > 4,000 chars
3. Ensure `content[0].text` is not dynamic (no per-user content in system prompt)

---

## Phase 6: Document and Deploy

### Update MEAL_PLAN_ALGORITHM.md
Add a dated entry:
```markdown
### YYYY-MM-DD — Prompt Update
**Problem:** [description]
**Change:** [what was modified]
**Result:** [metric improvement]
```

### Commit Message
```
fix(meal-plan): improve recipe diversity constraint in Claude prompt

Before: avg 15.2 unique recipes/plan
After:  avg 18.7 unique recipes/plan
No token cost change.
```

### Monitor After Deploy
Check `llm_usage_log` for 24 hours after deploying any prompt change:
- Parse failures (unexpected retry spikes)
- Cost delta from baseline
- Cache hit rate (should remain similar)

---

## Model Upgrade Checklist

When upgrading model versions (e.g. haiku-4-5 → haiku-5-x):

```
□ Check Anthropic docs for breaking changes in the new model
□ Run full test suite: /test-meal-plan × 5 with new model string
□ Compare output quality: diversity, coverage, savings accuracy
□ Compare token usage: new models often have different output lengths
□ Update model string in mealPlan.ts
□ Update cost estimates in MEAL_PLAN_ALGORITHM.md
□ Monitor for 48 hours post-deploy
□ Have rollback plan: keep old model string in a comment
```
