# Rule: AI Prompt Engineering

## Claude API Conventions
- Free users: `claude-haiku-4-5-20251001`, `max_tokens: 1500`
- Premium users: `claude-sonnet-4-6`, `max_tokens: 2500`
- Model strings are set in `mealPlan.ts` — never hardcode elsewhere
- Always log to `llm_usage_log` after every Claude call

## Prompt Caching
- System prompt must use `cache_control: { type: "ephemeral" }` on its content block
- Recipe DB goes in system prompt (large, static per week) — cache it
- Sale items + user preferences go in user prompt (dynamic) — do not cache
- Check cached_tokens in response to verify caching is working

## JSON Output
- Always instruct Claude to return ONLY valid JSON — no markdown fences
- Strip ` ```json ` fences before parsing: `text.replace(/\`\`\`(?:json)?\n?/g, "")`
- Validate with Zod schema immediately after parsing
- Use `callClaudeWithRetry()` — retries once on parse/validation failure

## Prompt Structure (meal plan)
```
System: [recipe DB + constraints + output schema]  ← cached
User:   [sale items + household size + dietary]    ← dynamic
```

## Output Schema (ClaudeResponseSchema)
```typescript
{
  meal_plan: Array<{
    day: 0-6,
    meals: {
      breakfast: { recipe_id: UUID, notes: string },
      lunch:     { recipe_id: UUID, notes: string },
      dinner:    { recipe_id: UUID, notes: string },
    }
  }>,  // exactly 7 items
  total_estimated_cost: number,
  savings_vs_regular: number,
  llm_summary: string
}
```

## Quality Rules in Prompt
Always include these constraints in the system prompt:
- Return exactly 7 days (days 0–6)
- No recipe repeated more than twice in a week
- Prioritize recipes with higher `matched_sale_items` counts
- Minimize total cost
- Return ONLY valid JSON matching the schema

## Cost Estimation
- Haiku: ~$0.001/plan (input ~2000 tokens, output ~600 tokens)
- Sonnet: ~$0.006/plan (input ~4000 tokens, output ~800 tokens)
- With caching: system prompt tokens (recipe DB ~3000) cached after first call
