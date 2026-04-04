# /deploy — Pre-Deploy Checklist and Deployment Steps

Run before every production deployment.

## Pre-Deploy Checklist

### Code Quality
```bash
npm run check        # biome lint + format check
npx tsc --noEmit     # TypeScript — zero errors allowed
npm run build        # Next.js build must succeed
cd apps/scraper && ruff check . && poetry run pytest
```

### Security Scan
```bash
# Check for accidentally staged secrets
git diff --staged | grep -E "(API_KEY|SECRET|PASSWORD|TOKEN)" | grep "^\+"
# Must return nothing
```

### Environment Variables
Confirm these are set in Vercel dashboard (not just .env.local):
```
□ NEXT_PUBLIC_SUPABASE_URL
□ NEXT_PUBLIC_SUPABASE_ANON_KEY
□ SUPABASE_SERVICE_ROLE_KEY
□ ANTHROPIC_API_KEY
□ UPSTASH_REDIS_REST_URL
□ UPSTASH_REDIS_REST_TOKEN
□ STRIPE_SECRET_KEY
□ STRIPE_WEBHOOK_SECRET
□ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
□ STRIPE_PREMIUM_PRICE_ID
□ RESEND_API_KEY
□ NEXT_PUBLIC_POSTHOG_KEY
□ CRON_SECRET
□ ALERT_WEBHOOK_URL
```

### Database Migrations
If any new migrations:
```bash
npx supabase db push   # apply to remote Supabase
```

## Deploy Web App
```bash
git push origin main   # Vercel auto-deploys from main
# Monitor: https://vercel.com/dashboard
```

## Deploy Scraper
```bash
cd apps/scraper
flyctl deploy          # deploys to Fly.io
flyctl status          # confirm healthy
```

## Post-Deploy Smoke Tests
```
□ Landing page loads
□ /api/trpc/stores.list returns data
□ Auth flow: magic link sends
□ /plan loads for existing user
□ /api/cron/check-llm-spend returns 200
□ Scraper /health returns { status: "ok" }
```

## Rollback
```bash
# Web: revert in Vercel dashboard → Deployments → previous deploy → Redeploy
# Scraper:
flyctl releases list
flyctl deploy --image <previous-image>
```
