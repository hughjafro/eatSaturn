# CartSpoon Operations Runbook

> Incident response procedures for on-call situations.
> Severity: 🔴 Critical (revenue/data impact) | 🟡 Warning (degraded) | 🔵 Info (monitoring)

---

## Quick Reference

| Issue | First Check | Command |
|---|---|---|
| Scraper failed | Alert webhook + item count | `/scrape --check` |
| No meal plans generating | Recipe match count | SQL below |
| LLM cost spike | llm_usage_log | `/check-costs` |
| Stripe webhook failing | Stripe dashboard | `stripe listen` |
| Auth broken | Supabase Auth logs | Supabase dashboard |
| Admin page 404 | IP allowlist | Check `ADMIN_ALLOWED_IPS` |

---

## 🔴 SCRAPER FAILURE

**Symptoms:** Alert webhook fires with low/zero item count. Users see
"Not enough recipes matched" error when generating plans.

### Step 1: Assess Damage
```sql
-- How many items scraped this week per store?
SELECT s.name, COUNT(si.id) AS item_count
FROM stores s
LEFT JOIN sale_items si
  ON si.store_id = s.id
  AND si.week_of = date_trunc('week', now())::date + 1
GROUP BY s.name;
-- Healthy: ≥ 20 per store. Unhealthy: < 20 or 0.
```

### Step 2: Trigger Manual Rescrape
```bash
# If scraper service is running on Fly.io:
curl -X POST https://cartspoon-scraper.fly.dev/scrape/trigger \
  -H "X-Scraper-Secret: $SCRAPER_SECRET"

# Locally:
curl -X POST http://localhost:8080/scrape/trigger \
  -H "X-Scraper-Secret: $SCRAPER_SECRET"
```

### Step 3: Diagnose If Rescrape Fails
```bash
# Run the failing scraper in isolation
cd apps/scraper
poetry run python -c "
from src.scrapers.kroger import KrogerScraper
from uuid import uuid4
s = KrogerScraper(uuid4(), 'https://www.kroger.com/weeklyad', {'crawl_delay_ms': 3000})
items = s.scrape()
print(f'Items: {len(items)}')
if items: print(items[0])
"
```

**If 0 items returned:**
1. Open the grocery store URL in a browser
2. Inspect DOM — has the CSS selector changed?
3. Update selector in `apps/scraper/src/scrapers/<chain>.py`
4. Update fixture in `tests/fixtures/<chain>_weekly_ad.html`
5. Re-run tests: `poetry run pytest tests/test_scrapers.py`
6. Deploy fix: `flyctl deploy` from `apps/scraper/`

**If Playwright timeout:**
- Increase `crawl_delay_ms` in the store's `scrape_config` JSONB in DB
- Check if Cloudflare bot detection was added (may need user-agent rotation)

**If IP blocked:**
- Consider rotating proxy or using a managed scraping service
- Escalate to human for Apify/ScrapingBee decision

---

## 🔴 MEAL PLAN GENERATION FAILING

**Symptoms:** Users get error when clicking "Build my plan".
tRPC returns `PRECONDITION_FAILED` or `INTERNAL_SERVER_ERROR`.

### PRECONDITION_FAILED: "Not enough recipes matched"
```sql
-- Check recipe match count for this week
SELECT COUNT(*) AS matched_recipes
FROM get_recipes_matching_sale_items(
  ARRAY(SELECT id FROM stores WHERE is_active = true),
  date_trunc('week', now())::date + 1
);
-- If < 7: scrapers likely failed. Fix scrapers first.
-- If ≥ 7 but users still get this error: check their specific store_ids
```

```sql
-- Check for a specific user's stores
SELECT COUNT(*)
FROM get_recipes_matching_sale_items(
  '{store-uuid-1, store-uuid-2}'::uuid[],
  date_trunc('week', now())::date + 1
);
```

### INTERNAL_SERVER_ERROR: Claude API failure
```sql
-- Check recent LLM log for errors
SELECT created_at, model, cost_usd
FROM llm_usage_log
ORDER BY created_at DESC
LIMIT 10;
-- If no recent rows: Claude call is failing before logging
```

Check Anthropic status page: https://status.anthropic.com
Check `ANTHROPIC_API_KEY` is set in Vercel env vars.

### Plan already exists but shows "generate" button
```sql
-- Check if plan exists for this user + week
SELECT id, week_of, status, llm_summary
FROM meal_plans
WHERE user_id = '<user-id>'
ORDER BY created_at DESC LIMIT 5;
```
If plan exists but UI doesn't show it: Redis cache may have stale data.
Force-clear: delete the Redis key for this user's cache key.

---

## 🔴 STRIPE WEBHOOK FAILING

**Symptoms:** User pays but tier doesn't update to premium.

### Verify Webhook Receipt
1. Go to Stripe Dashboard → Developers → Webhooks
2. Check the endpoint events for `checkout.session.completed`
3. Look for failed deliveries

### Local Debug
```bash
# Install Stripe CLI, then:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

### Common Causes
- `STRIPE_WEBHOOK_SECRET` mismatch between Stripe dashboard and Vercel env
- Route handler returning non-200 (check Vercel function logs)
- `userId` missing from session metadata (check checkout route)

### Manual Fix (emergency)
```sql
-- Manually upgrade a user who paid but wasn't upgraded:
UPDATE users
SET tier = 'premium',
    stripe_customer_id = '<stripe_customer_id>'
WHERE email = '<user@email.com>';
```
Always verify payment in Stripe dashboard before running this.

---

## 🟡 LLM COST SPIKE

**Symptoms:** Daily spend alert fires (> $5/day). Admin page shows
unusual spend.

### Investigate
```sql
SELECT model, user_tier, COUNT(*), ROUND(SUM(cost_usd)::numeric, 4) AS total
FROM llm_usage_log
WHERE logged_date = CURRENT_DATE
GROUP BY model, user_tier
ORDER BY total DESC;
```

**High haiku calls from free users:** Normal if user base is growing.
Check if rate limiting is working:
```sql
-- Free users who generated more than 1 plan this week:
SELECT user_id, COUNT(*) AS plans
FROM meal_plans
WHERE week_of = date_trunc('week', now())::date + 1
GROUP BY user_id HAVING COUNT(*) > 1
ORDER BY plans DESC;
```

**Sonnet calls from free users:** Should be impossible. Check
`model` selection logic in `mealPlan.ts` — must be gated on `user.tier`.

**Cost per call higher than expected:**
- Cache may be broken (check `cached_tokens`)
- Recipe list may have grown (check token counts)
- Retry rate may be high (parse failures burning double tokens)

### Emergency Brake
Force all users to haiku temporarily:
```typescript
// In mealPlan.ts, temporarily override:
const model = "claude-haiku-4-5-20251001"; // was: isPremium ? sonnet : haiku
```
Deploy, monitor, revert once root cause is fixed.

---

## 🟡 AUTHENTICATION BROKEN

**Symptoms:** Users can't log in. Magic links not sending or not working.

### Check Supabase Auth
1. Supabase Dashboard → Authentication → Logs
2. Look for OTP send failures or verification errors

### Common Causes
- Supabase email rate limit hit (default: 2 emails/hour on free plan)
  → Upgrade Supabase plan or configure custom SMTP
- `site_url` mismatch in Supabase Auth settings vs actual domain
- `emailRedirectTo` in `signInWithOtp()` doesn't match allowed redirect URLs

### Google OAuth Failing
- Check Google Cloud Console → OAuth consent screen → Authorized redirect URIs
- Must include: `https://<your-supabase-project>.supabase.co/auth/v1/callback`

---

## 🟡 ADMIN PAGE NOT LOADING

**Symptoms:** `/admin` redirects to home page in production.

### Check IP Allowlist
```bash
# Your current IP:
curl ifconfig.me

# Check allowed IPs in Vercel env:
echo $ADMIN_ALLOWED_IPS
```
Add your IP to `ADMIN_ALLOWED_IPS` in Vercel environment variables.
Format: comma-separated, e.g. `1.2.3.4,5.6.7.8`

---

## 🔵 WEEKLY SCRAPER SCHEDULE

**When:** Every Sunday at 23:00 ET (APScheduler in `scheduler.py`)
**Monitor:** Check Fly.io logs Monday morning

```bash
# Check Fly.io logs from last scrape run:
flyctl logs --app cartspoon-scraper | grep -E "(Scraped|ERROR|WARNING|Alert)"
```

Expected log output (healthy):
```
2025-01-13 23:00:00 INFO runner: Scraping kroger for week of 2025-01-13
2025-01-13 23:01:30 INFO runner: Scraped 45 items from kroger
2025-01-13 23:01:31 INFO db_writer: Upserted 45 sale items
2025-01-13 23:01:31 INFO runner: Scraping safeway for week of 2025-01-13
...
2025-01-13 23:05:00 INFO runner: Scheduled scrape complete: {'kroger': 45, 'safeway': 52, 'aldi': 38}
```

---

## 🔵 DATABASE BACKUP VERIFICATION

Supabase runs automatic daily backups on paid plans.
To verify: Supabase Dashboard → Settings → Backups

For manual point-in-time check:
```sql
-- Verify recent data integrity
SELECT
  (SELECT COUNT(*) FROM sale_items WHERE week_of >= CURRENT_DATE - 14) AS recent_sale_items,
  (SELECT COUNT(*) FROM meal_plans WHERE created_at >= NOW() - INTERVAL '7 days') AS recent_plans,
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM recipes) AS total_recipes;
```

---

## Escalation Contacts

| Issue | Owner |
|---|---|
| Anthropic API outage | https://status.anthropic.com — wait for resolution |
| Supabase outage | https://status.supabase.com — check managed service status |
| Vercel deployment failure | https://www.vercel-status.com |
| Fly.io scraper down | https://status.fly.io |
| Stripe outage | https://www.stripestatus.com |

---

## Post-Incident Checklist

After resolving any 🔴 incident:
```
□ Root cause identified and documented
□ Fix deployed and verified
□ Affected users notified (if data was impacted)
□ Alert threshold adjusted if it was too sensitive/insensitive
□ New test added to prevent regression
□ RUNBOOK.md updated with new steps if procedure was novel
```
