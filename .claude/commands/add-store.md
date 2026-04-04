# /add-store — Onboard a New Grocery Chain

End-to-end workflow for adding a new grocery store scraper.

## Usage
```
/add-store <store-name> <weekly-ad-url>
```
Example: `/add-store "Whole Foods" https://www.wholefoodsmarket.com/sales-flyer`

## Steps

### 1. Analyze the Target Page
- Use `WebFetch` or Playwright to inspect the page structure
- Identify CSS selectors for: product card, product name, sale price,
  regular price, category, image
- Note any lazy-loading, JS rendering, or pagination behavior
- Check robots.txt and Terms of Service

### 2. Scaffold the Scraper
Create `apps/scraper/src/scrapers/<chain_key>.py`:
```python
class <Name>Scraper(BaseScraper):
    chain_key = "<chain_key>"

    def parse_sale_items(self, page: Page) -> list[dict]:
        # implement selector logic
        # return list of raw dicts with keys:
        # product_name, sale_price_raw, regular_price_raw,
        # category_raw, image_url, raw_description
```

### 3. Register the Scraper
Add to `SCRAPER_MAP` in `apps/scraper/src/runner.py`:
```python
from .scrapers.<chain_key> import <Name>Scraper
SCRAPER_MAP = {
    ...
    "<chain_key>": <Name>Scraper,
}
```

### 4. Create Test Fixture
- Save a real HTML snapshot of the weekly ad page
- Save to: `apps/scraper/tests/fixtures/<chain_key>_weekly_ad.html`
- Add tests in `test_scrapers.py` covering:
  - Empty page returns []
  - Known product card parses correctly
  - Price normalization (X for $Y format)
  - Category inference

### 5. Add DB Seed Row
Write a new migration or add to `004_seed.sql`:
```sql
INSERT INTO stores (name, chain_key, scrape_url, scrape_config)
VALUES ('<Name>', '<chain_key>', '<url>', '<config_json>'::jsonb);
```

### 6. Verify Health Check
Run scraper manually and confirm:
```bash
poetry run python -m src.server
curl -X POST http://localhost:8080/scrape/trigger \
  -H "X-Scraper-Secret: $SCRAPER_SECRET"
```
Confirm item count ≥ 20 in DB.

### 7. Open PR
- Title: `feat: add <Name> grocery chain scraper`
- Include fixture file and test results
