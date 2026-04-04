# CartSpoon — Architecture Reference

> This document describes system design, data flow, and component
> relationships. For conventions and guardrails, see `CLAUDE.md`.
> For the grocery data schema, see `docs/GROCERY_DATA_SPEC.md`.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│                  Next.js 16.2.2 (Vercel)                    │
│   App Router + React Server Components + tRPC API routes    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Auth (OTP   │  │  tRPC        │  │  Cron Routes     │  │
│  │  + Google)   │  │  Routers     │  │  (Vercel Cron)   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + Auth + RLS)              │
│                                                             │
│  auth.users ──► users ──► user_preferences                  │
│  stores ──► sale_items                                      │
│  recipes ──► recipe_ingredients                             │
│  users ──► meal_plans ──► meal_plan_days                    │
│  meal_plans ──► shopping_lists ──► shopping_list_items      │
│  llm_usage_log                                              │
└─────────────────────────────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌──────────────┐   ┌─────────────────────────────────────────┐
│  Upstash     │   │          Anthropic Claude API            │
│  Redis       │   │  haiku-4-5 (free) / sonnet-4-6 (premium)│
│  (cache +    │   └─────────────────────────────────────────┘
│  rate limit) │
└──────────────┘

┌─────────────────────────────────────────────────────────────┐
│          Python Scraper Service (Fly.io / FastAPI)           │
│                                                             │
│  APScheduler (Sunday 23:00 ET)                              │
│    ──► BaseScraper ──► KrogerScraper                        │
│                    ──► SafewayScraper                       │
│                    ──► AldiScraper                          │
│    ──► normalizer.py ──► db_writer.py ──► Supabase          │
└─────────────────────────────────────────────────────────────┘
```

---

## Web App — Next.js 16.2.2

### App Router Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx              # Root layout: TRPCProvider, PostHogProvider
│   ├── page.tsx                # Landing page (public)
│   ├── auth/
│   │   ├── login/page.tsx      # Magic link + Google OAuth
│   │   └── signup/page.tsx     # Email → store selection → /plan/generate
│   ├── plan/
│   │   ├── page.tsx            # 7-day grid view (RSC, protectedProcedure)
│   │   └── generate/page.tsx   # Plan generation trigger (client)
│   ├── recipes/[id]/page.tsx   # Recipe detail (public)
│   ├── sale-items/page.tsx     # This week's deals by store (public)
│   ├── shopping-list/page.tsx  # Checklist with sale prices (protected)
│   ├── account/page.tsx        # Profile, tier, store preferences (protected)
│   ├── upgrade/page.tsx        # Pricing page + Stripe checkout
│   ├── admin/page.tsx          # Internal dashboard (IP-gated)
│   └── api/
│       ├── trpc/[trpc]/route.ts        # tRPC handler
│       ├── checkout/route.ts           # Stripe checkout session
│       ├── webhooks/stripe/route.ts    # Stripe webhook handler
│       └── cron/
│           ├── check-llm-spend/route.ts  # Daily spend alert
│           └── weekly-email/route.ts     # Sunday plan-ready email
├── server/api/
│   ├── root.ts                 # Composes all routers → AppRouter
│   ├── trpc.ts                 # Context, procedure tiers, middleware
│   └── routers/
│       ├── stores.ts           # stores.list
│       ├── saleItems.ts        # saleItems.getCurrentWeek
│       ├── user.ts             # user.getProfile, getPreferences, updatePreferences
│       ├── mealPlan.ts         # mealPlan.generate, getCurrent, getHistory
│       └── recipes.ts          # recipes.getById
└── middleware.ts               # Auth guard: /plan, /account, /shopping-list
```

### Authentication Flow

```
1. User submits email → supabase.auth.signInWithOtp()
2. Magic link email sent via Supabase Auth
3. User clicks link → redirected to /plan (or /auth/callback for signup)
4. middleware.ts intercepts protected routes → checks session
5. tRPC context (createTRPCContext) reads session + fetches users row
6. users row created on first login via Supabase auth webhook (service role)
```

Google OAuth follows the same redirect flow via `signInWithOAuth`.

### tRPC Context Chain

```
Request
  └─► createTRPCContext (trpc.ts)
        └─► createSupabaseServerClient (cookie-aware)
        └─► supabase.auth.getSession()
        └─► supabase.from("users").select("*")  (if session exists)
        └─► returns { supabase, session, user }
              └─► publicProcedure    — ctx.user may be null
              └─► protectedProcedure — ctx.user guaranteed, throws UNAUTHORIZED
              └─► premiumProcedure   — ctx.user.tier === "premium", throws FORBIDDEN
```

### Meal Plan Generation Flow

```
mealPlan.generate mutation
  1. Check existing plan for (user_id, week_of) → return if found
  2. Get user's preferred_store_ids from user_preferences
  3. Build dietary flags (gluten_free, vegetarian, vegan) — premium only
  4. Compute Redis cache key: sha256(storeIds + weekOf + dietary)[:16]
  5. Redis HIT → return cached plan_id (if belongs to this user)
  6. Fetch sale_items (limit 150) from Supabase
  7. Call get_recipes_matching_sale_items() Postgres function (pg_trgm, threshold 0.4)
  8. Guard: throw PRECONDITION_FAILED if < 7 recipes matched
  9. Build Claude prompt:
       - System: recipe DB (cache_control: ephemeral) + constraints
       - User: sale items + household size + dietary restrictions
  10. Call Claude (haiku free / sonnet premium), parse JSON with Zod
  11. Retry once on parse failure (callClaudeWithRetry)
  12. Write meal_plan + meal_plan_days + shopping_list rows to DB
  13. Log to llm_usage_log (model, cost_usd, user_tier)
  14. Cache plan_id in Redis (TTL: 7 days)
  15. Capture PostHog event "plan_generated"
  16. Return { planId, cached: false }
```

### Stripe Payment Flow

```
User clicks "Upgrade" → POST /api/checkout
  └─► Stripe checkout.sessions.create (mode: subscription)
  └─► metadata: { userId }
  └─► Redirect to Stripe hosted checkout

Stripe → POST /api/webhooks/stripe
  checkout.session.completed
    └─► supabaseAdmin.from("users").update({ tier: "premium", stripe_customer_id })
  customer.subscription.deleted
    └─► supabaseAdmin.from("users").update({ tier: "free" })
```

---

## Python Scraper Service

### Component Relationships

```
scheduler.py (APScheduler, Sunday 23:00 ET)
  └─► runner.run_all_scrapers()
        └─► get_active_stores() → Supabase: SELECT * FROM stores WHERE is_active
        └─► For each store, instantiate scraper by chain_key:
              SCRAPER_MAP = {
                "kroger":  KrogerScraper,
                "safeway": SafewayScraper,
                "aldi":    AldiScraper,
              }
        └─► scraper.scrape()
              └─► BaseScraper._fetch_page() → Playwright headless Chromium
              └─► scraper.parse_sale_items(page) → list[dict]  (subclass impl)
              └─► BaseScraper.normalize_item(raw) → SaleItem
                    └─► normalizer.normalize_name()
                    └─► normalizer.extract_unit()
                    └─► normalizer.extract_price()
                    └─► normalizer.infer_category()
                    └─► normalizer.strip_quantity_from_name()
        └─► db_writer.write_sale_items(items) → Supabase upsert
        └─► Health check: count_sale_items() ≥ 20 or send_alert()

server.py (FastAPI, :8080)
  └─► GET  /health        → { status: "ok" }
  └─► POST /scrape/trigger → X-Scraper-Secret header required
                           → run_all_scrapers() (manual trigger)

alerting.py → POST ALERT_WEBHOOK_URL (Slack/Discord JSON payload)
```

### Scraper Chain Notes

| Chain   | Key Selector              | Special Handling                            |
| ------- | ------------------------- | ------------------------------------------- |
| Kroger  | `.kds-Price`              | JS SPA — waits for `domcontentloaded`       |
| Safeway | `.weekly-ad-item`         | JS SPA — similar wait pattern               |
| Aldi    | `.product-tile`           | Lazy loads — 2× scroll + 3s delay required  |

### Normalizer Pipeline

```
Raw: "Boneless Skinless Chicken Breast (3 lb pack)"
  1. normalize_name()     → "boneless skinless chicken breast"
  2. extract_unit()       → qty="3", unit="lb"
  3. strip_quantity()     → "boneless skinless chicken breast"
  4. infer_category()     → "meat"
  5. extract_price("$1.99/lb") → 1.99
  6. extract_price("2/$5")    → 2.50  (handles X for $Y)
```

---

## Database Schema

### Table Dependency Order

```
stores
  └─► sale_items (FK: store_id)
        └─► shopping_list_items (FK: sale_item_id, store_id)

recipes
  └─► recipe_ingredients (FK: recipe_id)
        └─► [matched against sale_items via pg_trgm in get_recipes_matching_sale_items()]

auth.users (Supabase managed)
  └─► users (FK: id mirrors auth.users.id)
        └─► user_preferences (FK: user_id, UNIQUE)
        └─► meal_plans (FK: user_id)
              └─► meal_plan_days (FK: meal_plan_id, recipe_id)
              └─► shopping_lists (FK: meal_plan_id, UNIQUE)
                    └─► shopping_list_items (FK: shopping_list_id)
              └─► llm_usage_log (FK: meal_plan_id, nullable)
```

### Key Indexes

```sql
-- Sale items — core lookup pattern
idx_sale_items_store_week   ON sale_items (store_id, week_of)
idx_sale_items_normalized   ON sale_items USING GIN (normalized_name gin_trgm_ops)
idx_sale_items_category     ON sale_items (category, week_of)

-- Recipe matching
idx_recipe_ingredients_normalized  USING GIN (normalized_name gin_trgm_ops)
idx_recipes_dietary                ON recipes (is_gluten_free, is_vegetarian, is_vegan)
idx_recipes_meal_type              ON recipes (meal_type)

-- Query patterns
idx_meal_plans_user_week    ON meal_plans (user_id, week_of)
idx_meal_plan_days_plan     ON meal_plan_days (meal_plan_id)
idx_llm_usage_log_date      ON llm_usage_log (logged_date)
```

### Core Postgres Function

`get_recipes_matching_sale_items(store_ids, week_of, dietary_flags, threshold=0.4)`

Joins `recipe_ingredients` → `sale_items` via `pg_trgm similarity()`.
Returns recipes ordered by `matched_items DESC, estimated_cost ASC`.
Limit: 200. Used exclusively by `mealPlan.generate`.

### RLS Policy Summary

| Table                  | Read                     | Write                      |
| ---------------------- | ------------------------ | -------------------------- |
| `stores`               | Public                   | Service role only          |
| `sale_items`           | Public                   | Service role only          |
| `recipes`              | Public                   | Service role only          |
| `recipe_ingredients`   | Public                   | Service role only          |
| `users`                | Own row (`auth.uid()`)   | Own row (no tier changes)  |
| `user_preferences`     | Own row                  | Own row                    |
| `meal_plans`           | Own row                  | Own row + tier check       |
| `meal_plan_days`       | Via meal_plan ownership  | Via meal_plan ownership    |
| `shopping_lists`       | Via meal_plan ownership  | Via meal_plan ownership    |
| `shopping_list_items`  | Via shopping_list chain  | Via shopping_list chain    |
| `llm_usage_log`        | None (service role only) | Service role only          |

---

## Cron Jobs (Vercel)

Configured in `apps/web/vercel.json`:

| Route                        | Schedule       | Purpose                              |
| ---------------------------- | -------------- | ------------------------------------ |
| `/api/cron/check-llm-spend`  | `0 8 * * *`    | Daily 8am — alert if spend > $5/day |
| `/api/cron/weekly-email`     | `0 18 * * 0`   | Sunday 6pm — send weekly plan emails |

Both routes require `Authorization: Bearer {CRON_SECRET}` header.

---

## Email Flow

```
weekly-email cron
  └─► Query user_preferences WHERE notification_day = 'sunday'
  └─► Query users WHERE id IN (user_ids)
  └─► For each user:
        └─► render(<WeeklyPlanEmail weekOf={...} />) via @react-email/render
        └─► resend.emails.send({ from, to, subject, html })
        └─► Errors are caught per-user — one failure doesn't stop others
```

---

## Analytics Events (PostHog)

| Event              | Trigger                          | Key Properties                               |
| ------------------ | -------------------------------- | -------------------------------------------- |
| `$pageview`        | Every route change               | `$current_url`                               |
| `plan_generated`   | Successful plan creation         | `week_of`, `model`, `store_count`, `is_premium`, `total_cost`, `savings` |
| `upgrade_clicked`  | Upgrade button click             | `source`                                     |
| `shopping_list_opened` | Shopping list page view      | —                                            |

Server-side events use `posthog-node` (`src/lib/posthog.ts`) with `flushInterval: 0` for serverless compatibility.

---

## Environment Variables

| Variable                          | Where Used            | Notes                                    |
| --------------------------------- | --------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Client + Server       | Public                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Client + Server       | Public (RLS enforces security)           |
| `SUPABASE_SERVICE_ROLE_KEY`       | Server only           | Never expose — bypasses RLS              |
| `ANTHROPIC_API_KEY`               | Server only           | Never expose to client bundle            |
| `UPSTASH_REDIS_REST_URL`          | Server only           |                                          |
| `UPSTASH_REDIS_REST_TOKEN`        | Server only           |                                          |
| `STRIPE_SECRET_KEY`               | Server only           |                                          |
| `STRIPE_WEBHOOK_SECRET`           | Webhook route only    |                                          |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client            | Public                                   |
| `STRIPE_PREMIUM_PRICE_ID`         | Checkout route        |                                          |
| `RESEND_API_KEY`                  | Email cron            |                                          |
| `NEXT_PUBLIC_POSTHOG_KEY`         | Client + Server       | Public                                   |
| `CRON_SECRET`                     | Cron routes           | Vercel-injected bearer token             |
| `ALERT_WEBHOOK_URL`               | Scraper alerting      | Slack/Discord webhook URL                |
| `DATABASE_URL`                    | Python scraper        | Direct Postgres connection string        |
| `SCRAPER_SECRET`                  | Scraper FastAPI       | Protects manual trigger endpoint         |
| `ADMIN_ALLOWED_IPS`               | /admin page           | Comma-separated IPs for access control   |

---

## Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/hughjafro/eatSaturn
cd eatSaturn
npm install

# 2. Start Supabase locally
cd supabase && npx supabase start
# Note the local URL + anon key from output

# 3. Configure environment
cp .env.example apps/web/.env.local
# Fill in local Supabase URL, anon key, service role key
# Add ANTHROPIC_API_KEY, UPSTASH_, STRIPE_, RESEND_ values

# 4. Run migrations
npx supabase db push

# 5. Start web app
npm run dev   # from repo root → localhost:3000

# 6. Start scraper (optional)
cd apps/scraper
poetry install
poetry run python -m src.server   # localhost:8080
```
