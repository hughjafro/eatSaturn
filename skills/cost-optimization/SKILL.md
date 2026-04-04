# Skill: Cost Optimization

> Systematic process for reducing CartSpoon's AI and infrastructure costs
> without degrading user experience. Targets Claude API spend (primary),
> Redis usage, Supabase compute, and Vercel function costs.

---

## When to Use This Skill

- Monthly cost review
- After user base doubles (cost scales non-linearly with bad patterns)
- When daily LLM spend alert fires repeatedly
- When projecting costs for new feature (e.g. adding a 4th grocery chain)
- When preparing for a pricing change (free → more restricted, or vice versa)

---

## Phase 1: Establish Current Baseline

### LLM Cost Baseline
```sql
-- 30-day cost summary
SELECT
  date_trunc('week', logged_date::timestamp) AS week,
  model,
  COUNT(*)                                   AS calls,
  SUM(input_tokens)                          AS total_input,
  SUM(cached_tokens)                         AS total_cached,
  ROUND(
    SUM(cached_tokens)::numeric /
    NULLIF(SUM(input_tokens), 0) * 100, 1
  )                                          AS cache_hit_pct,
  SUM(output_tokens)                         AS total_output,
  ROUND(SUM(cost_usd)::numeric, 4)           AS total_cost,
  ROUND(AVG(cost_usd)::numeric, 6)           AS avg_cost_per_call
FROM llm_usage_log
WHERE logged_date >= CURRENT_DATE - 30
GROUP BY week, model
ORDER BY week DESC, model;
```

### User Growth Rate
```sql
-- Weekly new users (affects cost projection)
SELECT
  date_trunc('week', created_at) AS week,
  COUNT(*) AS new_users,
  COUNT(*) FILTER (WHERE tier = 'premium') AS new_premium
FROM users
WHERE created_at >= NOW() - INTERVAL '60 days'
GROUP BY week
ORDER BY week DESC;
```

### Plan Generation Rate
```sql
-- Plans per week (each = one LLM call)
SELECT
  date_trunc('week', created_at) AS week,
  COUNT(*) AS plans_generated,
  COUNT(*) FILTER (WHERE is_premium_plan) AS premium_plans,
  COUNT(*) FILTER (WHERE NOT is_premium_plan) AS free_plans
FROM meal_plans
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY week
ORDER BY week DESC;
```

### Cost per User (Unit Economics)
```sql
-- Monthly cost per active user
WITH monthly_cost AS (
  SELECT ROUND(SUM(cost_usd)::numeric, 2) AS total_usd
  FROM llm_usage_log
  WHERE logged_date >= date_trunc('month', CURRENT_DATE)
),
active_users AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM meal_plans
  WHERE created_at >= date_trunc('month', CURRENT_DATE)
)
SELECT
  total_usd,
  n AS active_users,
  ROUND(total_usd / NULLIF(n, 0), 4) AS cost_per_active_user
FROM monthly_cost, active_users;
```

---

## Phase 2: Identify Optimization Opportunities

Evaluate each area and score potential savings:

### Area 1: Prompt Caching Efficiency

**Current state check:**
```sql
SELECT
  ROUND(AVG(cached_tokens)::numeric / NULLIF(AVG(input_tokens), 0) * 100, 1)
    AS avg_cache_hit_pct
FROM llm_usage_log
WHERE logged_date >= CURRENT_DATE - 7;
```

**Target:** ≥ 40% cache hit rate
**Anthropic pricing:** Cached tokens cost 10% of normal input token price

**If cache hit rate < 20%:**
- Verify `cache_control: { type: "ephemeral" }` is on content[0] in `mealPlan.ts`
- Verify system prompt content > 1,024 tokens (Anthropic minimum for caching)
- Verify no per-user dynamic content is in the system prompt (invalidates cache)

**Potential savings at 50% hit rate vs 0%:**
- Sonnet input: $3/MTok → $0.30/MTok for cached tokens
- 3,000 cached tokens per call × $0.0027/call savings = ~$0.003/plan saved
- At 1,000 plans/month: ~$3/month savings

### Area 2: Token Reduction

**Measure current token usage:**
```sql
SELECT
  ROUND(AVG(input_tokens)::numeric, 0)  AS avg_input,
  ROUND(AVG(output_tokens)::numeric, 0) AS avg_output,
  ROUND(MAX(input_tokens)::numeric, 0)  AS max_input
FROM llm_usage_log
WHERE logged_date >= CURRENT_DATE - 7;
```

**Recipe DB trimming:**
Current fields sent per recipe: `id, title, meal_type, is_gluten_free, is_vegetarian, is_vegan, estimated_cost, matched_sale_items`

Fields that can be removed: `description`, `cuisine_type` (if still sent)
Savings: ~5 tokens per recipe × 200 recipes = 1,000 tokens per call

**Sale items trimming:**
Current fields: `product_name, category, sale_price, unit, normalized_name`
Remove: `raw_description`, `image_url` (already excluded)
Already minimal — minimal further reduction possible.

**Reduce recipe/sale item counts:**

| Parameter | Current | Reduced | Token savings |
|---|---|---|---|
| Recipe DB | 200 recipes | 150 recipes | ~500–700 tokens |
| Sale items | 150 items | 100 items | ~400–500 tokens |

Test quality impact before reducing: run `/test-meal-plan` at reduced counts
and verify ≥ 18 unique recipes and ≥ 60% sale coverage still achieved.

### Area 3: Model Tier Optimization

**Check if model assignment is correct:**
```sql
SELECT
  u.tier,
  l.model,
  COUNT(*) AS calls
FROM llm_usage_log l
JOIN users u ON u.id = (
  SELECT user_id FROM meal_plans WHERE id = l.meal_plan_id LIMIT 1
)
WHERE l.logged_date >= CURRENT_DATE - 7
GROUP BY u.tier, l.model;
```

**Expected:**
- Free users → haiku only
- Premium users → sonnet only

If free users are getting sonnet calls: check `mealPlan.ts` model selection logic.
If premium users are getting haiku: check tier detection.

**Sonnet vs Haiku quality comparison:**
If premium users report no quality difference, consider using haiku for all tiers
and using the cost savings to fund other improvements. Measure:
- Parse failure rate: haiku vs sonnet
- Recipe diversity: haiku vs sonnet
- User-reported satisfaction (if tracked)

### Area 4: Redis Cost Reduction

Upstash Redis pricing is based on commands + storage.
CartSpoon's Redis usage:
1. Plan ID caching: `set(cacheKey, planId, ex: 604800)` — 1 write per new plan
2. Plan cache reads: `get(cacheKey)` — 1 read per generate attempt
3. Rate limit checks: 2 Redis commands per generate attempt

**Check if plan caching is working:**
If `cached: true` appears rarely in PostHog events, users may be generating
plans with slightly different parameters each time (different dietary combos).

**Check rate limit key pattern:**
```typescript
// Rate limit key should match user ID precisely:
const { success } = await ratelimit.limit(user.id);
// Verify this is `user.id` (UUID), not `user.email` or composite key
```

### Area 5: Vercel Function Duration

**Potential issue:** Meal plan generation has multiple await chains.
Optimize with `Promise.all` for parallel fetches:
```typescript
// ✅ Already parallelized in mealPlan.ts:
const [saleItems, recipes] = await Promise.all([
  fetchSaleItems(storeIds, weekOf),
  fetchMatchingRecipes(storeIds, weekOf, dietary),
]);

// ❌ If these were sequential, fix them:
// const saleItems = await fetchSaleItems(...);
// const recipes = await fetchMatchingRecipes(...);  // waited for saleItems first
```

Vercel Pro timeout is 60s for serverless functions.
Claude calls with max_tokens: 2500 typically respond in 5–15 seconds.
If functions are timing out: check if `Promise.all` is being used for Supabase calls.

---

## Phase 3: Implement Optimizations

### Priority Order (by ROI)

| Optimization | Effort | Monthly Savings at 1k users |
|---|---|---|
| Fix broken prompt caching | Low | $3–15 |
| Trim recipe DB token count | Low | $1–5 |
| Add ingredient synonyms (improves cache hits via stable recipe matching) | Medium | Indirect |
| Reduce recipe count: 200 → 150 | Low | $0.50–2 |
| Implement plan-sharing (multiple users share 1 cached plan per store+week) | High | $5–20 |

### Plan-Sharing Optimization (High Value)

Currently each user generates their own Claude call even if they have the
same store+dietary preferences. The Redis cache is keyed by input hash
but checked against user_id ownership.

**Enhanced sharing approach:**
```typescript
// Current: cache key → planId → check if user_id matches
// Better: cache key → planId → clone plan for new user (no Claude call)

const cachedPlanId = await redis.get<string>(key);
if (cachedPlanId) {
  // Clone the cached plan for this user:
  const clonedPlanId = await clonePlanForUser(cachedPlanId, user.id);
  return { planId: clonedPlanId, cached: true };
}
```

This requires a `clonePlanForUser()` function that copies `meal_plan_days`
for a new user. Savings: ~40–60% LLM call reduction at scale where users
shop at the same stores.

### Token Reduction Implementation

```typescript
// In mealPlan.ts — trim recipe fields before serializing to prompt:
const trimmedRecipes = recipes.slice(0, 150).map((r) => ({
  id: r.recipe_id,
  title: r.title,
  meal_type: r.meal_type,
  is_gluten_free: r.is_gluten_free,
  is_vegetarian: r.is_vegetarian,
  is_vegan: r.is_vegan,
  cost: r.estimated_cost,          // shorter key name saves tokens
  matches: r.matched_items,         // shorter key name saves tokens
}));

// Trim sale item fields:
const trimmedSaleItems = saleItems.slice(0, 100).map((si) => ({
  name: si.normalized_name,         // use normalized (shorter, canonical)
  cat: si.category,
  price: si.sale_price,
  unit: si.unit,
}));
```

After changing field names, update the system prompt to reference the new
shorter keys. Run `/test-meal-plan` × 3 to verify quality unchanged.

---

## Phase 4: Validate and Monitor

### After Implementing Any Change

```sql
-- Compare 7-day averages before and after:
SELECT
  CASE WHEN logged_date < '<change_date>'
       THEN 'before' ELSE 'after' END AS period,
  ROUND(AVG(input_tokens)::numeric, 0)  AS avg_input,
  ROUND(AVG(cached_tokens)::numeric, 0) AS avg_cached,
  ROUND(AVG(output_tokens)::numeric, 0) AS avg_output,
  ROUND(AVG(cost_usd)::numeric, 6)      AS avg_cost
FROM llm_usage_log
WHERE logged_date BETWEEN '<7_days_before_change>' AND '<7_days_after_change>'
GROUP BY period;
```

### Quality Regression Check

After any token reduction:
```sql
-- Verify plan quality didn't degrade:
WITH post_change AS (
  SELECT meal_plan_id, COUNT(DISTINCT recipe_id) AS unique_recipes
  FROM meal_plan_days mpd
  JOIN meal_plans mp ON mp.id = mpd.meal_plan_id
  WHERE mp.created_at >= '<change_date>'
  GROUP BY meal_plan_id
)
SELECT AVG(unique_recipes) AS avg_unique_recipes_post_change
FROM post_change;
-- Target: ≥ 18 (same as baseline)
```

---

## Reporting Template

After completing a cost optimization cycle:

```
## Cost Optimization Report — YYYY-MM-DD

### Baseline (prior 30 days)
Avg cost/plan (haiku): $X.XXXXXX
Avg cost/plan (sonnet): $X.XXXXXX
Cache hit rate: XX%
Avg input tokens: XXXX
Plans/month: XXX
Monthly LLM spend: $XX.XX

### Changes Made
1. [Description] — [result]
2. [Description] — [result]

### Post-Change (7 days)
Avg cost/plan (haiku): $X.XXXXXX (XX% change)
Avg cost/plan (sonnet): $X.XXXXXX (XX% change)
Cache hit rate: XX%
Plan quality: XX avg unique recipes (no regression)

### Projected Monthly Savings
$XX.XX at current plan volume
$XXX.XX at 10× plan volume

### Next Review
Trigger: [cost spike / monthly schedule / user growth milestone]
```
