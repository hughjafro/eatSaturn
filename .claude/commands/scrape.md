# /scrape — Trigger and Debug Scrapers

Manually trigger scrapers, check results, and diagnose failures.

## Usage
```
/scrape [chain_key]        # trigger all or specific chain
/scrape --debug kroger     # verbose output for one chain
/scrape --check            # health check only, no scrape
```

## Trigger Manual Scrape
```bash
# Requires scraper service running locally or on Fly.io
curl -X POST http://localhost:8080/scrape/trigger \
  -H "X-Scraper-Secret: $SCRAPER_SECRET" \
  -H "Content-Type: application/json"
```

## Health Check Query
Run in Supabase SQL editor or via admin page:
```sql
SELECT
  s.name,
  si.week_of,
  COUNT(si.id) AS item_count,
  MIN(si.created_at) AS first_scraped,
  MAX(si.created_at) AS last_scraped
FROM stores s
LEFT JOIN sale_items si
  ON si.store_id = s.id
  AND si.week_of = date_trunc('week', now())::date + 1
GROUP BY s.name, si.week_of
ORDER BY s.name;
```
Expected: item_count ≥ 20 for each active store.

## Debug a Failing Scraper
1. Check if CSS selectors still match live page
2. Run isolated test:
```bash
cd apps/scraper
poetry run python -c "
from src.scrapers.kroger import KrogerScraper
from uuid import uuid4
s = KrogerScraper(uuid4(), 'https://www.kroger.com/weeklyad', {})
items = s.scrape()
print(f'Found {len(items)} items')
print(items[:3])
"
```
3. Check alert webhook fired: look for Slack/Discord message
4. Update selector in `apps/scraper/src/scrapers/<chain>.py`
5. Update fixture in `tests/fixtures/<chain>_weekly_ad.html`
6. Re-run tests: `poetry run pytest tests/test_scrapers.py`
