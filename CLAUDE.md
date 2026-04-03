# CartSpoon — Claude Code Primary Reference

## What This Project Is

Freemium SaaS: scrapes grocery store weekly sale ads → Claude generates
7-day meal plans with recipes, shopping lists, and cost estimates.
Free tier: 1 store, 1 plan/week. Premium ($6.99/mo): multi-store,
dietary filters, plan history, email delivery.

---

## Stack

| Layer      | Technology                                                       |
| ---------- | ---------------------------------------------------------------- |
| Frontend   | Next.js 16.2.2 (App Router), React 19, TypeScript, Tailwind v4  |
| API        | tRPC v11, Zod v4, superjson                                      |
| Auth / DB  | Supabase (PostgreSQL + Auth), auth-helpers-nextjs v0.15          |
| Cache      | Upstash Redis (`@upstash/redis` + `@upstash/ratelimit`)          |
| Payments   | Stripe v21                                                       |
| AI         | Anthropic — `claude-haiku-4-5` (free) / `claude-sonnet-4-6` (premium) |
| Email      | Resend + React Email                                             |
| Analytics  | PostHog (client + server)                                        |
| Scraper    | Python 3.9+, Playwright, FastAPI, APScheduler, Poetry            |
| Linting    | Biome (TS/JS), Ruff + Black (Python)                             |
| Deploy     | Vercel (web), Fly.io (scraper)                                   |

---

## Monorepo Structure

```
apps/web/         Next.js 16.2.2 frontend + API (Vercel)
apps/scraper/     Python scraper service (Fly.io)
packages/shared/  Shared TypeScript types/utilities
supabase/         DB migrations — run in order: 001 → 004
```

---

## Commands

### Web (`apps/web/`)

```bash
npm run dev       # dev server at localhost:3000
npm run build     # production build
npm run lint      # eslint
npm run check     # biome check + fix (from repo root)
npm run format    # biome format (from repo root)
npx tsc --noEmit  # typecheck
```

### Scraper (`apps/scraper/`)

```bash
poetry install
poetry run pytest                              # all tests
poetry run pytest tests/test_normalizer.py    # single test file
poetry run python -m src.server               # FastAPI on :8080
poetry run python -m src.scheduler            # start cron scheduler
ruff check .                                  # lint
black .                                       # format
```

---

## Business Rules

- **Free:** haiku model, 1 plan/week (Redis rate limit), 1 store, no dietary filters
- **Premium:** sonnet model, 2 plans/week, multi-store, dietary restrictions, plan history
- Tier stored in `users.tier` — set by Stripe webhook on `checkout.session.completed`
- Subscription cancelled → `customer.subscription.deleted` → tier reverts to `free`
- Plans Redis-cached 7 days by `sha256(storeIds + weekOf + dietary)[:16]`
- Scrapers run every Sunday at 23:00 ET via APScheduler

---

## tRPC Procedure Tiers

| Procedure           | Requirement                          |
| ------------------- | ------------------------------------ |
| `publicProcedure`   | None — unauthenticated               |
| `protectedProcedure`| Valid session + `users` row in DB    |
| `premiumProcedure`  | `users.tier === 'premium'`           |

Routers: `stores`, `saleItems`, `user`, `mealPlan`, `recipes` — composed in `root.ts`.

---

## Database Conventions

- `week_of` is **always Monday** — use `getMondayOfCurrentWeek()` exclusively
- `normalized_name` is the canonical ingredient key for fuzzy matching (pg_trgm)
- `discount_pct` is auto-computed by DB trigger on `sale_items` — never set manually
- Every new table **must** have RLS enabled + explicit policies in its migration file
- Upserts on `sale_items` are idempotent: `UNIQUE(store_id, week_of, normalized_name)`

---

## Supabase Client Rules

| Client                      | Use case                                          |
| --------------------------- | ------------------------------------------------- |
| `supabase/client.ts`        | Browser / Client Components only                 |
| `supabase/server.ts`        | Server Components, tRPC context (cookie-aware)    |
| `supabase/admin.ts`         | Service-role bypass — server-only files only      |

Never import `supabaseAdmin` outside of a `server-only` file.

---

## File Conventions

- Server-only files: `import "server-only"` at top, before all other imports
- Client components: `"use client"` directive required, no DB imports allowed
- tRPC callers: RSC uses `src/lib/trpc/server.ts`; client uses `src/lib/trpc/client.ts`
- Commits: Conventional Commits format (`feat:`, `fix:`, `chore:`, `refactor:`, etc.)
- TypeScript: strict mode, no `any` — use types from `src/types/database.ts`

---

## Critical API Notes

### Supabase `auth-helpers-nextjs` v0.15
Use the new `createServerClient(url, key, { cookies: { getAll, setAll } })` API.
The old helpers (`createServerComponentClient`, `createClientComponentClient`,
`createMiddlewareClient`) **do not exist** in this version. Do not use them.

### Tailwind v4
Uses `@import 'tailwindcss'` and `@theme inline {}` in CSS.
There is **no** `tailwind.config.js`. Do not create one.

### Stripe
API version: `2026-03-25.dahlia` (SDK `stripe@^21`).
Always use this exact version string in `new Stripe(key, { apiVersion: ... })`.

### Next.js 16.2.2
This version has breaking changes vs. earlier training data.
Read `node_modules/next/dist/docs/` before writing any Next.js-specific code.
See also `apps/web/AGENTS.md` for agent-specific guidance.

### Anthropic SDK
Use `@anthropic-ai/sdk`. Prompt caching via `cache_control: { type: "ephemeral" }`
on the system prompt content block. Strip ```json fences before parsing responses.
Always log to `llm_usage_log` after every Claude call.

---

## NEVER DO

- **Never** expose `SUPABASE_SERVICE_ROLE_KEY` outside `server-only` files
- **Never** skip RLS when creating a new table — it must be in the migration
- **Never** hardcode `week_of` dates — always use `getMondayOfCurrentWeek()`
- **Never** set `discount_pct` manually — it is trigger-computed
- **Never** add a store scraper without a `HEALTH_MIN_ITEMS = 20` check
- **Never** call Claude without inserting a row into `llm_usage_log`
- **Never** use `any` in TypeScript — use proper types
- **Never** import `supabaseAdmin` in a client component or non-server file
- **Never** write to `users.tier` directly — only Stripe webhooks may do this

---

## Security Baseline

- Validate all user input with Zod (TypeScript) or Pydantic (Python) before use
- No secrets, tokens, or API keys in source code, logs, or commit history
- Run before every PR: `npm run check` (TS/JS) and `ruff check . && poetry run pytest` (Python)

---

## Active Work

<!-- Update this section at the start of each Claude Code session -->
<!-- Format: [DATE] — what is in progress, what was last completed -->
