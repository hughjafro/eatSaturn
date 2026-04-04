# /test-meal-plan — Validate Meal Plan Generation

Run Claude prompt QA against sample sale data and validate output quality.

## Steps

### 1. Generate a Test Plan
Call the generate endpoint directly with test credentials, or run:
```bash
# From apps/web/ with .env.local populated
npx ts-node -e "
import { callClaude } from './src/server/api/routers/mealPlan';
// paste test sale items and recipes inline
"
```

### 2. Validate JSON Schema
Claude's response must pass `ClaudeResponseSchema` (Zod):
- `meal_plan`: array of exactly 7 days (day 0–6)
- Each day: `breakfast`, `lunch`, `dinner` — all with valid `recipe_id` (UUID)
- `total_estimated_cost`: positive number
- `savings_vs_regular`: number ≥ 0
- `llm_summary`: non-empty string

### 3. Quality Checks
Run these checks on the output:
```
□ All 21 meals filled (7 days × 3 meals)
□ No recipe_id appears more than 2 times
□ recipe_ids exist in the recipes table
□ total_estimated_cost is between $40–$250
□ At least 50% of recipes have matched sale items
□ No breakfast recipes assigned to dinner slots
□ llm_summary mentions the store name and week
```

### 4. Dietary Compliance Check (premium)
If dietary flags are set:
```
□ is_gluten_free=true → all recipes must have is_gluten_free=true
□ is_vegetarian=true  → all recipes must have is_vegetarian=true
□ is_vegan=true       → all recipes must have is_vegan=true
```

### 5. Cost Sanity
```sql
-- Check estimated_cost accuracy for matched recipes
SELECT r.title, r.estimated_cost, COUNT(si.id) as matched_sale_items
FROM recipes r
LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
LEFT JOIN sale_items si ON similarity(ri.normalized_name, si.normalized_name) > 0.4
WHERE r.id = ANY('{recipe_ids_from_plan}'::uuid[])
GROUP BY r.id, r.title, r.estimated_cost;
```

### 6. Report
Output: PASS / FAIL with specific failures listed.
If failing: check prompt in `routers/mealPlan.ts` → `systemPrompt` variable.
