# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CartSpoon** — a freemium SaaS app that scrapes grocery store weekly sale ads and generates AI-assisted meal plans. Free tier: 1 store, 1 plan/week. Premium ($6.99/mo): multi-store, dietary filters, plan history, email delivery.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2.2 (App Router), React 19, TypeScript, Tailwind v4 |
| API | tRPC v11, Zod v4, superjson |
| Auth / DB | Supabase (PostgreSQL + Auth), `@supabase/auth-helpers-nextjs` v0.15 |
| Cache | Upstash Redis (`@upstash/redis` + `@upstash/ratelimit`) |
| Payments | Stripe v21 |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) — haiku-4-5 (free) / sonnet-4-6 (premium) |
| Email | Resend + React Email |
| Analytics | PostHog (client + server) |
| Scraper | Python 3.9+, Playwright, FastAPI, APScheduler, Poetry |
| Linting | Biome (TS/JS), ESLint (Next.js), Ruff + Black (Python) |
| Deploy | Vercel (web), Fly.io (scraper) |

## Monorepo Structure

```
apps/web/       Next.js 16.2.2 frontend + API (deployed to Vercel)
apps/scraper/   Python scraper service (deployed to Fly.io)
packages/shared/ Shared TypeScript types/utilities
supabase/       DB migrations (run in numeric order: 001 → 004)
```

## Commands

### Web app (`apps/web/`)
```bash
npm run dev          # dev server (from repo root or apps/web)
npm run build        # production build
npm run lint         # eslint
npm run format       # biome format (repo root)
npm run check        # biome check + fix (repo root)
```

### Scraper (`apps/scraper/`)
```bash
poetry install
poetry run pytest                    # all tests
poetry run pytest tests/test_normalizer.py  # single test file
poetry run python -m src.scheduler   # start cron scheduler
poetry run python -m src.server      # start FastAPI server
ruff check .                         # lint
black .                              # format
```

## Architecture

### Web App (Next.js App Router + tRPC)

All data fetching goes through **tRPC** (`src/server/api/`). Three procedure tiers are defined in `trpc.ts`:
- `publicProcedure` — unauthenticated
- `protectedProcedure` — requires auth session + `users` row
- `premiumProcedure` — requires `users.tier === 'premium'`

Routers: `stores`, `saleItems`, `user`, `mealPlan`, `recipes` — all composed in `root.ts`.

**tRPC client setup:** `src/lib/trpc/client.ts` (React Query client), `src/lib/trpc/server.ts` (RSC caller).

**Supabase clients** — three variants, each with a distinct purpose:
- `src/lib/supabase/client.ts` — browser client (Client Components)
- `src/lib/supabase/server.ts` — server client with cookie forwarding (Server Components, tRPC context)
- `src/lib/supabase/admin.ts` — service-role bypass (server-only, used in tRPC mutations that need to write across RLS)

**Auth flow:** Middleware (`src/middleware.ts`) guards `/plan`, `/account`, `/shopping-list`. Auth pages live at `src/app/auth/`.

**Meal plan generation** (`routers/mealPlan.ts`): calls `get_recipes_matching_sale_items` Postgres function → sends to Claude API → validates response with Zod → caches result in Redis. Free users get `claude-haiku-4-5`, premium gets `claude-sonnet-4-6`.

**Email** (`src/emails/`): React Email templates rendered and sent via Resend. Weekly email delivered by cron route `src/app/api/cron/weekly-email/route.ts`.

**Rate limiting:** Upstash Redis + `@upstash/ratelimit` in `src/lib/ratelimit.ts`.

**Analytics:** PostHog (`src/lib/posthog.ts`), server-side via `posthog-node`.

### Python Scraper Service

`BaseScraper` (`base_scraper.py`) — abstract class; all store scrapers extend it and implement `parse_sale_items(page)`. Playwright runs headless Chromium. Normalization (price, unit, category, name) is centralized in `normalizer.py`.

Store scrapers: `scrapers/kroger.py`, `scrapers/safeway.py`, `scrapers/aldi.py`.

`runner.py` — loads active stores from DB, dispatches to the right scraper class by `chain_key`, writes results via `db_writer.py`.

`scheduler.py` — APScheduler cron, runs all scrapers every Sunday at 23:00 ET.

`server.py` — FastAPI service exposing a `/scrape` trigger endpoint (for manual runs).

### Database (Supabase/PostgreSQL)

Key tables: `stores`, `sale_items` (unique on `store_id + week_of + normalized_name`), `recipes`, `recipe_ingredients`, `users` (mirrors `auth.users.id`), `user_preferences`, `meal_plans`, `meal_plan_days`, `shopping_lists`, `shopping_list_items`, `llm_usage_log`.

`discount_pct` is auto-computed by a DB trigger on `sale_items`.

RLS policies are in `003_rls.sql`. Seed data (stores, initial recipes) in `004_seed.sql`.

The `get_recipes_matching_sale_items` function (defined in `002_functions.sql`) is the core query joining recipes/ingredients against current sale items.

## Conventions

- Write tests before code (TDD).
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.).
- Run lint and typecheck before opening a PR: `npm run check` (TS/JS) and `ruff check . && poetry run pytest` (Python).

## Security

- No secrets, tokens, or API keys in source code or log output.
- Validate all user-supplied input with Zod (TypeScript) or Pydantic (Python) before use.

## Critical API Notes

### `@supabase/auth-helpers-nextjs` v0.15
Use the **new** `createServerClient(url, key, { cookies: { getAll, setAll } })` API. The old `createServerComponentClient`, `createClientComponentClient`, and `createMiddlewareClient` do not exist in this version.

### Tailwind v4
Uses `@import 'tailwindcss'` and `@theme inline {}` in CSS. There is **no** `tailwind.config.js`.

### Stripe
API version: `2026-03-25.dahlia` (SDK `stripe@^21`).

### Next.js 16.2.2
This version has breaking changes vs. training data. Read `node_modules/next/dist/docs/` before writing any Next.js-specific code (per `apps/web/AGENTS.md`).
