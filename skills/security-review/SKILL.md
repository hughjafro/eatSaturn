# Skill: Security Review

> Full security audit process for CartSpoon PRs and periodic reviews.
> Covers secrets, RLS, input validation, API surface, and dependency
> vulnerabilities. Run before every significant feature release.

---

## When to Use This Skill

- Before any production deployment touching auth, payments, or data access
- When a new table, tRPC procedure, or REST endpoint is added
- Monthly periodic review
- After a dependency audit flags vulnerabilities
- When a new developer joins and pushes their first PR

---

## Audit Scope

```
1. Secrets & Environment Variables
2. RLS Policy Completeness
3. Input Validation Coverage
4. API Surface & Authorization
5. Client/Server Boundary
6. Stripe Webhook Security
7. Scraper Security
8. Dependency Vulnerabilities
```

---

## 1. Secrets & Environment Variables

### Scan for Hardcoded Secrets
```bash
# In the repo root:
git log --all --full-history -- "*.ts" "*.tsx" "*.py" "*.env*" | head -20

# Scan staged changes:
git diff --staged | grep -E "(sk_|pk_|sbp_|re_|whsec_|phc_|eyJ)" | grep "^\+"

# Scan all TypeScript files for potential secrets:
grep -r --include="*.ts" --include="*.tsx" \
  -E "(API_KEY|SECRET|PASSWORD|TOKEN)\s*=\s*['\"][^$]" \
  apps/web/src/ | grep -v ".env"
# Expected: 0 matches
```

### Verify .env.example Has No Real Values
```bash
# Check for real-looking key patterns in .env.example:
grep -E "(sk_live|sk_test|sbp_|re_[A-Za-z0-9]{20})" .env.example
# Expected: 0 matches (only placeholder text)
```

### Verify .gitignore Covers Local Env Files
```bash
git check-ignore -v .env .env.local apps/web/.env.local CLAUDE.local.md
# All should show as ignored
```

### Check Server-Only Files
```bash
# Find all imports of supabaseAdmin — must only be in server-only files:
grep -r "from.*supabase/admin" apps/web/src/ --include="*.ts" --include="*.tsx"
# Each result must either:
#   a) Have 'import "server-only"' at the top, OR
#   b) Be an API route (apps/web/src/app/api/...)

# Verify server-only import exists in admin.ts consumers:
for f in $(grep -rl "supabaseAdmin" apps/web/src/ --include="*.ts"); do
  if ! grep -q 'import "server-only"' "$f" && ! echo "$f" | grep -q "/api/"; then
    echo "MISSING server-only: $f"
  fi
done
```

### Check ANTHROPIC_API_KEY Exposure
```bash
# Must not appear in any client-side code:
grep -r "ANTHROPIC_API_KEY" apps/web/src/ --include="*.tsx" --include="*.ts" |
  grep -v "server-only" | grep -v "/api/" | grep -v "lib/trpc/server"
# Expected: 0 matches
```

---

## 2. RLS Policy Completeness

### Check All Tables Have RLS Enabled
```sql
-- Run in Supabase Studio or psql:
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Every table must show rls_enabled = true
```

### Check All Tables Have at Least One Policy
```sql
SELECT
  tablename,
  COUNT(policyname) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
-- Compare against tables list above — no table should have 0 policies
```

### Check Write Policies Have WITH CHECK
```sql
SELECT
  tablename,
  policyname,
  cmd,
  qual,         -- USING clause
  with_check    -- WITH CHECK clause
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'ALL')
ORDER BY tablename;
-- Every INSERT/UPDATE policy must have with_check IS NOT NULL
-- with_check = 'true' only acceptable for explicitly public tables
```

### Verify Service-Role-Only Tables Have Zero User Policies
```sql
-- llm_usage_log should have NO user-accessible policies:
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'llm_usage_log'
  AND schemaname = 'public';
-- Expected: 0 rows (service role bypasses RLS automatically)
```

---

## 3. Input Validation Coverage

### tRPC Procedures — Every Input Must Have Zod Schema
```bash
# Find procedures that use .query() or .mutation() without .input():
grep -n "\.query\(async\|\.mutation\(async" \
  apps/web/src/server/api/routers/*.ts |
  # Check if preceded by .input() on a nearby line — manual review needed
  head -30
```

Manual check: open each router file and verify every procedure with
user-supplied data has `.input(z.object({...}))`.

### Python Scraper — Pydantic Models
```bash
# All DB writes should go through the SaleItem Pydantic model:
grep -n "insert\|execute" apps/scraper/src/db_writer.py
# Each INSERT should use data from validated SaleItem objects
```

### Check for Direct `request.body` Usage
```bash
# REST route handlers should never use body directly without parsing:
grep -rn "req\.body\|request\.body" apps/web/src/app/api/ --include="*.ts"
# Exceptions: Stripe webhook uses raw body for signature verification (OK)
```

---

## 4. API Surface & Authorization

### Check All Protected Routes Have Auth
```bash
# Review middleware coverage:
cat apps/web/src/middleware.ts
# PROTECTED_PATHS must include all routes that require auth
# Currently: /plan, /account, /shopping-list
```

Manual verification — visit each protected route without auth:
```
□ /plan → redirects to /auth/login
□ /account → redirects to /auth/login
□ /shopping-list → redirects to /auth/login
□ /admin → redirects to / (IP check)
```

### Check tRPC Procedure Tier Usage
```bash
# Find all procedures and their tier:
grep -n "publicProcedure\|protectedProcedure\|premiumProcedure" \
  apps/web/src/server/api/routers/*.ts
```

Verify:
- `saleItems.getCurrentWeek` — public ✓ (intended)
- `stores.list` — public ✓ (intended)
- `recipes.getById` — public ✓ (intended)
- `mealPlan.generate` — protected ✓ (auth required)
- `mealPlan.getHistory` — premium ✓ (tier required)
- `user.updatePreferences` (dietary) — premium-gated via in-procedure check ✓

### Admin Page IP Check
```bash
# Verify IP allowlist logic in admin route:
grep -A5 "checkAdminAccess\|ADMIN_ALLOWED_IPS" apps/web/src/app/admin/page.tsx
# Must redirect in production if IP not in allowlist
```

---

## 5. Client/Server Boundary

### No DB Imports in Client Components
```bash
# Client components must not import Supabase directly:
grep -rn "from.*supabase" apps/web/src/ --include="*.tsx" |
  grep -v "client.ts\|use client" |
  # Flag files that import supabase but aren't client.ts:
  grep "supabase-js\|supabase/client\|supabase/server\|supabase/admin"
```

Manual check: every file that imports from `@supabase/supabase-js` directly
should be in `src/lib/supabase/` only.

### No ANTHROPIC_API_KEY in Client Bundle
```bash
# Build and check bundle for key patterns:
cd apps/web && npm run build 2>&1 | grep -i "warning\|error"
# Then inspect build output:
grep -r "ANTHROPIC_API_KEY" .next/ 2>/dev/null | head -5
# Expected: 0 matches
```

---

## 6. Stripe Webhook Security

### Signature Verification
```bash
# Webhook handler must use constructEvent():
grep -A3 "constructEvent\|stripe-signature" \
  apps/web/src/app/api/webhooks/stripe/route.ts
# Must throw on invalid signature before processing any event data
```

### No Sensitive Data in Response
```bash
# Webhook handler must return minimal response:
grep "return NextResponse.json" \
  apps/web/src/app/api/webhooks/stripe/route.ts
# Should only return { received: true } — no user data
```

### Manual Tier Manipulation Check
```sql
-- Verify users.tier can only be changed via service role (Stripe webhook):
-- The webhook handler uses supabaseAdmin — check it's the only writer:
grep -rn "tier.*premium\|premium.*tier\|UPDATE.*users.*tier" \
  apps/web/src/ --include="*.ts"
# Should only appear in the Stripe webhook handler
```

---

## 7. Scraper Security

### Rate Limiting in Place
```bash
grep "crawl_delay_ms\|wait_for_timeout\|HEALTH_MIN_ITEMS" \
  apps/scraper/src/runner.py apps/scraper/src/base_scraper.py
```

### Scraper Trigger Auth
```bash
grep -A5 "x_scraper_secret\|SCRAPER_SECRET" \
  apps/scraper/src/server.py
# Must reject requests with wrong or missing secret
```

### No User Data in Scraper Logs
```bash
# Scraper logs should only contain product names and counts:
grep -n "logger\." apps/scraper/src/*.py apps/scraper/src/scrapers/*.py |
  grep -i "user\|email\|password\|token\|key"
# Expected: 0 matches
```

---

## 8. Dependency Vulnerabilities

### NPM Audit
```bash
cd apps/web
npm audit --audit-level=high
# Fix any HIGH or CRITICAL vulnerabilities before shipping
```

### Python Safety Check
```bash
cd apps/scraper
pip install safety --break-system-packages 2>/dev/null || true
safety check --full-report
# Or use: poetry run pip-audit (if pip-audit installed)
```

---

## Reporting

### Severity Definitions

| Severity | Definition | Response |
|---|---|---|
| **CRITICAL** | Exposes secrets, bypasses auth, allows data exfiltration | Block deploy, fix immediately |
| **HIGH** | Missing RLS on user data, missing auth on protected route | Block PR merge |
| **MEDIUM** | Missing input validation, overly broad RLS, weak rate limiting | Fix before next release |
| **LOW** | Minor code style issue, missing error message detail | Fix at next opportunity |
| **INFO** | Observation, no security impact | Document only |

### Report Format

```
## Security Review — YYYY-MM-DD
Reviewer: [name/agent]
Scope: [PR #N / periodic review]

### CRITICAL
None ✅

### HIGH
[H1] Missing RLS policy on `saved_recipes` table
     File: supabase/migrations/005_add-user-saved-recipes.sql
     Fix: Add ALTER TABLE saved_recipes ENABLE ROW LEVEL SECURITY;
          and user-ownership SELECT/INSERT/UPDATE/DELETE policies

### MEDIUM
[M1] User.updatePreferences accepts dietaryRestrictions for free tier
     (currently blocked in code, but Zod input accepts it — defense in depth gap)
     File: apps/web/src/server/api/routers/user.ts
     Fix: Add .refine() to Zod input schema

### LOW / INFO
None

### Summary
1 HIGH issue must be resolved before merge.
```
