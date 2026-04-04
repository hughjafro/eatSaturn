# Developer Onboarding

> Everything needed to go from zero to a running local CartSpoon
> development environment. Est. time: 45–60 minutes.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.9.0 | https://nodejs.org or `nvm install 20` |
| Python | ≥ 3.9 | https://python.org or `pyenv install 3.11` |
| Poetry | ≥ 1.7 | `curl -sSL https://install.python-poetry.org \| python3 -` |
| Supabase CLI | Latest | `npm install -g supabase` |
| Git | Any | Pre-installed on most systems |
| Docker | Latest | Required by Supabase CLI for local DB |

Optional but recommended:
- `gh` (GitHub CLI) — for `/fix-issue` command
- `stripe` (Stripe CLI) — for local webhook testing
- `flyctl` (Fly.io CLI) — for scraper deployment

---

## Step 1: Clone and Install

```bash
git clone https://github.com/hughjafro/eatSaturn.git cartspoon
cd cartspoon
npm install                     # installs web app + root dependencies
cd apps/scraper && poetry install && cd ../..
```

---

## Step 2: Start Local Supabase

```bash
cd supabase
npx supabase start
```

This starts a local PostgreSQL instance, Auth server, and REST API.
On first run it pulls Docker images (~2 min). On subsequent runs it's fast.

Copy the output values — you'll need them in Step 3:
```
API URL:     http://localhost:54321
anon key:    eyJ...
service_role key: eyJ...  ← keep this secret
```

Apply migrations:
```bash
npx supabase db push
# or: npx supabase db reset  (drops + recreates from scratch)
```

Verify in Supabase Studio (http://localhost:54323):
- Tables: stores, sale_items, recipes, users, etc. all exist
- Seed data: 3 stores (Kroger, Safeway, Aldi) in `stores` table

---

## Step 3: Configure Environment

```bash
cd apps/web
cp ../../.env.example .env.local
```

Edit `apps/web/.env.local`:

```bash
# From Step 2 Supabase output:
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>

# From Anthropic console (https://console.anthropic.com):
ANTHROPIC_API_KEY=sk-ant-...

# Upstash Redis — create free account at https://upstash.com
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# Stripe — use test mode keys from https://dashboard.stripe.com/test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # from: stripe listen (Step 6)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PREMIUM_PRICE_ID=price_...  # create a test product in Stripe

# Resend — create free account at https://resend.com
RESEND_API_KEY=re_...

# PostHog — create free account at https://posthog.com (or leave blank for dev)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Local development
CRON_SECRET=local-cron-secret-dev
ALERT_WEBHOOK_URL=  # leave blank to skip alerts locally
ADMIN_ALLOWED_IPS=127.0.0.1
```

For the scraper (optional):
```bash
cd apps/scraper
cp ../../.env.example .env
# Fill in DATABASE_URL using local Supabase connection string:
# postgresql://postgres:postgres@localhost:54322/postgres
```

---

## Step 4: Seed Recipes

The recipe database needs to be populated before meal plan generation works.

**Option A: Spoonacular import (recommended, requires free API key)**
```bash
# Get a free key at https://spoonacular.com/food-api
# Add to apps/scraper/.env: SPOONACULAR_API_KEY=...

cd apps/scraper
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
poetry run python -m src.recipe_importer
# Imports ~180 recipes across breakfast/lunch/dinner
# Takes ~3 minutes (respects rate limits)
```

**Option B: SQL seed (quick, fewer recipes)**
```bash
# Run the test seed script:
cd supabase
npx supabase db reset   # this runs 004_seed.sql which includes store seed
# You'll need to add recipe SQL manually or use Option A
```

---

## Step 5: Start the Web App

```bash
# From repo root:
npm run dev
```

Open http://localhost:3000. You should see the CartSpoon landing page.

**Quick sanity checks:**
- http://localhost:3000/sale-items — should show store picker
- http://localhost:3000/upgrade — pricing page
- http://localhost:3000/auth/login — magic link form

---

## Step 6: Local Stripe Webhooks (optional)

To test the upgrade flow locally:
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook signing secret (whsec_...) to STRIPE_WEBHOOK_SECRET in .env.local
```

In a separate terminal, trigger a test event:
```bash
stripe trigger checkout.session.completed
```

---

## Step 7: Run the Scraper Locally (optional)

```bash
cd apps/scraper

# Start the FastAPI server:
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
SCRAPER_SECRET=local-dev-secret \
poetry run python -m src.server

# In another terminal, trigger a scrape:
curl -X POST http://localhost:8080/scrape/trigger \
  -H "X-Scraper-Secret: local-dev-secret"

# Check results:
curl http://localhost:54321/rest/v1/sale_items \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>"
```

Note: Live scraping hits real grocery websites. Run sparingly and respect
`crawl_delay_ms`. For development, use fixture-based tests instead.

---

## Step 8: Run Tests

```bash
# TypeScript type check:
cd apps/web && npx tsc --noEmit

# Biome lint + format:
npm run check   # from repo root

# Python tests (no live network calls):
cd apps/scraper && poetry run pytest -v
```

All tests should pass before your first commit.

---

## Project Structure Quick Reference

```
CLAUDE.md                    ← Read this first every session
docs/ARCHITECTURE.md         ← System design and data flows
docs/GROCERY_DATA_SPEC.md    ← Scraper and normalization rules
docs/MEAL_PLAN_ALGORITHM.md  ← Claude prompt and generation flow
docs/RUNBOOK.md              ← Incident response

apps/web/src/
  app/                       ← Next.js App Router pages
  server/api/routers/        ← tRPC routers (all business logic)
  lib/supabase/              ← Three Supabase client variants
  components/                ← React components

apps/scraper/src/
  scrapers/                  ← Store-specific scrapers
  normalizer.py              ← Name/price/category normalization
  base_scraper.py            ← Abstract base class
  runner.py                  ← Orchestrates all scrapers
  db_writer.py               ← Supabase upsert logic

supabase/migrations/
  001_initial_schema.sql     ← Tables and indexes
  002_functions.sql          ← get_recipes_matching_sale_items()
  003_rls.sql                ← Row-level security policies
  004_seed.sql               ← Store seed data
```

---

## Common First-Day Issues

**`supabase start` fails:**
Make sure Docker Desktop is running. On Apple Silicon, Docker may need
Rosetta 2 enabled: System Settings → General → Rosetta.

**Magic link doesn't arrive locally:**
Supabase local uses Inbucket for email. Go to http://localhost:54324
to see all emails sent by the local auth server.

**"Not enough recipes matched":**
Recipes table is empty. Complete Step 4 (seed recipes) before testing
meal plan generation.

**tRPC errors on first load:**
Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are set correctly. The anon key from `supabase start` is different from
the production key.

**Python `ModuleNotFoundError`:**
Run `poetry install` from `apps/scraper/`. Make sure you're using the
Poetry-managed virtualenv: `poetry run python` not `python`.

---

## Useful Development Commands

```bash
# Reset local DB to clean state:
cd supabase && npx supabase db reset

# Generate TypeScript types after schema changes:
cd supabase && npx supabase gen types typescript --local \
  > ../apps/web/src/types/database.ts

# Inspect local DB directly:
psql postgresql://postgres:postgres@localhost:54322/postgres

# View local auth emails:
open http://localhost:54324

# View Supabase Studio (DB browser):
open http://localhost:54323
```
