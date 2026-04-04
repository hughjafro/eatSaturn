# /review — Full Code Review

Run a thorough code review on the current diff or specified files.

## Steps

1. **TypeScript & Types**
   - No `any` usage — check with `npx tsc --noEmit`
   - All tRPC procedures return typed responses
   - Zod schemas match DB types in `src/types/database.ts`

2. **Security**
   - No `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` in client files
   - Every new table has RLS enabled in its migration
   - All user input validated with Zod before DB writes
   - `supabaseAdmin` only imported in `server-only` files

3. **Database**
   - New tables have RLS policies in `003_rls.sql` or new migration
   - FK columns have indexes
   - Text search columns use `gin_trgm_ops`
   - No raw SQL — use Supabase client or stored procedures

4. **React / Next.js**
   - Server Components don't import client-only hooks
   - Client Components have `"use client"` directive
   - No direct DB calls in Client Components (use tRPC)
   - Images use `next/image` with `sizes` prop

5. **Accessibility**
   - Interactive elements are keyboard-navigable
   - Buttons have descriptive labels (not just icons)
   - Color contrast meets WCAG AA

6. **Tests**
   - New scraper selectors have fixture-based unit tests
   - New tRPC procedures have at least one integration test
   - Run: `poetry run pytest` + `npx tsc --noEmit`

7. **Scraper Standards** (if scraper files changed)
   - Extends `BaseScraper`, implements `parse_sale_items()`
   - Has `crawl_delay_ms` respect
   - Registered in `SCRAPER_MAP` in `runner.py`

## Output Format
List issues by severity: BLOCKER → WARNING → SUGGESTION
