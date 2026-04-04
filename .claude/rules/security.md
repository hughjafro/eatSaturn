# Rule: Security

## Secrets
- Never commit secrets to git — use `.env.local` (gitignored)
- `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-only
- Check before every commit: `git diff --staged | grep -E "KEY|SECRET|TOKEN"`
- `.env.example` must contain only placeholder values (no real keys)

## Supabase / RLS
- Every new table must have `ALTER TABLE <n> ENABLE ROW LEVEL SECURITY;`
  in the same migration that creates it — never in a separate migration
- Write policies must always include `WITH CHECK` clause
- `USING (true)` is only acceptable for public read-only tables (stores, sale_items, recipes)
- `supabaseAdmin` (service role) may only be imported in files with `import "server-only"`

## Input Validation
- All user-supplied data validated with Zod before any DB write
- tRPC inputs: Zod schema required on every procedure
- Scraper data: normalized through `normalizer.py` before insertion
- Never trust `req.body` directly — always parse through schema

## API Routes
- Stripe webhook: always verify signature with `stripe.webhooks.constructEvent()`
- Cron routes: always check `Authorization: Bearer {CRON_SECRET}`
- Scraper trigger: always check `X-Scraper-Secret` header
- Admin page: IP allowlist enforced, redirect on mismatch

## Dependencies
- Run `npm audit` before major releases
- Pin major versions in `package.json`
- Review scraper dependencies for known CVEs before adding

## Logging
- Never log full request bodies (may contain auth tokens)
- Never log Stripe webhook payloads (contain payment data)
- Scraper logs: product names and prices only, no user data
