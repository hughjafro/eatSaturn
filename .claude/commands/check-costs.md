# /check-costs — LLM and Infrastructure Spend Audit

Review Claude API usage, Redis usage, and project cost trends.

## Daily LLM Spend
```sql
-- Today's spend by model and tier
SELECT
  model,
  user_tier,
  COUNT(*) AS calls,
  SUM(input_tokens) AS total_input,
  SUM(output_tokens) AS total_output,
  SUM(cached_tokens) AS total_cached,
  ROUND(SUM(cost_usd)::numeric, 4) AS total_cost_usd
FROM llm_usage_log
WHERE logged_date = CURRENT_DATE
GROUP BY model, user_tier
ORDER BY total_cost_usd DESC;
```

## Weekly Trend
```sql
SELECT
  logged_date,
  COUNT(*) AS calls,
  ROUND(SUM(cost_usd)::numeric, 4) AS cost_usd
FROM llm_usage_log
WHERE logged_date >= CURRENT_DATE - 7
GROUP BY logged_date
ORDER BY logged_date DESC;
```

## Monthly Projection
```sql
-- Extrapolate from last 7 days
SELECT
  ROUND(AVG(daily_cost) * 30, 2) AS projected_monthly_usd
FROM (
  SELECT logged_date, SUM(cost_usd) AS daily_cost
  FROM llm_usage_log
  WHERE logged_date >= CURRENT_DATE - 7
  GROUP BY logged_date
) daily;
```

## Cache Hit Rate (Redis)
Check Upstash dashboard or estimate:
```sql
-- Plans served from cache vs generated fresh
-- (cached plans don't create llm_usage_log rows for that session)
SELECT
  week_of,
  COUNT(*) AS total_plans
FROM meal_plans
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY week_of;
```

## Cost Optimization Flags
- If haiku % < 70% of calls → free tier users hitting limits wrong
- If cost > $5/day → alert threshold, check for abuse
- If cached_tokens < 20% of input_tokens → prompt caching not working
- If avg cost/plan > $0.01 → prompt is too long, consider trimming recipe list

## Alert Threshold
Current threshold: `$5/day` — set in `src/app/api/cron/check-llm-spend/route.ts`
Change `DAILY_SPEND_ALERT_THRESHOLD` to adjust.
