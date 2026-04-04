# Rule: Scraper Standards

## Class Structure
- Every scraper extends `BaseScraper` from `base_scraper.py`
- Must implement `parse_sale_items(self, page: Page) -> list[dict[str, Any]]`
- Raw dicts must have keys: `product_name`, `sale_price_raw`, `regular_price_raw`,
  `category_raw`, `image_url`, `raw_description`
- Normalization handled by `BaseScraper.normalize_item()` — do not duplicate

## Rate Limiting
- `crawl_delay_ms` default: 3000ms — never set below 2000ms
- Aldi gets 4000ms minimum (heavy lazy-loading)
- Add explicit `page.wait_for_timeout()` after scroll actions

## Playwright Conventions
- Always launch headless: `pw.chromium.launch(headless=True)`
- User agent: set to current Chrome on macOS (see base_scraper.py)
- Wait strategy: `domcontentloaded` for SPAs, then wait for key selector
- Timeout: 30 seconds page load, 15 seconds selector wait

## Error Handling
- Never let a single scraper failure stop others — catch per-store
- Log all exceptions with `logger.error(..., exc_info=True)`
- Send alert via `alerting.send_alert()` on any exception
- Health check: `count_sale_items(store_id, week_of) >= HEALTH_MIN_ITEMS (20)`

## Testing Requirements
- Every scraper must have fixture HTML: `tests/fixtures/<chain>_weekly_ad.html`
- Required tests:
  1. `parse_sale_items()` on empty HTML returns `[]`
  2. `parse_sale_items()` on known product card parses correctly
  3. `normalize_item()` sets category correctly
  4. `normalize_item()` parses `X for $Y` price format
  5. Fixture-based test with captured real HTML

## Adding a New Chain
1. Create `src/scrapers/<chain_key>.py` extending `BaseScraper`
2. Set `chain_key = "<chain_key>"` as class attribute
3. Register in `SCRAPER_MAP` in `runner.py`
4. Add store row to `supabase/migrations/` seed or new migration
5. Create `tests/fixtures/<chain_key>_weekly_ad.html`
6. Add test class to `tests/test_scrapers.py`

## NEVER
- Never scrape without respecting `crawl_delay_ms`
- Never hardcode store UUIDs — always load from DB via `get_active_stores()`
- Never commit real scraped data to the repo
- Never use synchronous HTTP in async contexts — use Playwright consistently
