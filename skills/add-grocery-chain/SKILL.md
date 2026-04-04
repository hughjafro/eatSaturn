# Skill: Add Grocery Chain

> End-to-end workflow for onboarding a new grocery store scraper into
> CartSpoon. Covers DOM analysis, scraper implementation, tests, DB seed,
> and deployment. Estimated time: 2–4 hours per chain.

---

## When to Use This Skill

- Adding a new grocery chain (Whole Foods, Trader Joe's, Publix, H-E-B, etc.)
- Rebuilding a scraper after a grocery chain redesigns their website
- Migrating from a broken scraper to a new selector strategy

---

## Prerequisites

- Access to the grocery chain's weekly ad URL
- Local environment running (see `docs/ONBOARDING.md`)
- `poetry run pytest` passing before you start

---

## Phase 1: Intelligence Gathering

### 1.1 Inspect the Target Page

Open the weekly ad URL in a real browser with DevTools open.

**Answer these questions before writing any code:**

```
□ Does the page require JavaScript? (check: does content appear in curl output?)
□ Does it lazy-load on scroll?
□ Is there pagination (multiple pages of deals)?
□ Are there category tabs or filters to navigate?
□ What is the most stable CSS selector for a product card container?
□ What selects the product name within a card?
□ What selects the sale price?
□ What selects the regular/was price? (may not exist)
□ What selects the category label? (may not exist)
□ What selects the product image? (check data-src vs src for lazy images)
```

### 1.2 Selector Stability Assessment

Rate each selector you find on this scale:

| Priority | Selector Type | Example | Stability |
|---|---|---|---|
| 1 (best) | data-testid / data-qa | `[data-testid="product-card"]` | High — rarely changes |
| 2 | Semantic class name | `.product-title`, `.sale-price` | Medium — changes with redesigns |
| 3 | Component class | `.kds-Price`, `.weekly-ad-item` | Medium — chain-specific |
| 4 | Generic structural | `div > span:nth-child(2)` | Low — breaks easily |

**Always choose the highest-priority stable selector available.**

### 1.3 Capture a Live HTML Snapshot

```python
# Run this once to capture the live page for fixture use:
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(user_agent=(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ))
    page.goto("https://www.TARGET_STORE.com/weeklyad", wait_until="domcontentloaded")
    page.wait_for_timeout(4000)  # let JS render
    # If lazy-loading:
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)

    html = page.content()
    with open("apps/scraper/tests/fixtures/TARGET_CHAIN_weekly_ad.html", "w") as f:
        f.write(html)
    print(f"Saved {len(html)} chars")
    browser.close()
```

Inspect the saved HTML to finalize your selectors before writing the scraper.

---

## Phase 2: Implement the Scraper

### 2.1 Create the Scraper File

`apps/scraper/src/scrapers/<chain_key>.py`

```python
"""<Store Name> weekly ad scraper."""
from __future__ import annotations

import logging
from typing import Any

from playwright.sync_api import Page
from bs4 import BeautifulSoup

from ..base_scraper import BaseScraper

logger = logging.getLogger(__name__)


class <n>Scraper(BaseScraper):
    chain_key = "<chain_key>"

    def _fetch_page(self, browser: Any) -> Page:
        """Override only if special fetch behavior needed (e.g. scroll, click)."""
        page = super()._fetch_page(browser)
        # Example: scroll for lazy-loading
        # page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        # page.wait_for_timeout(2000)
        return page

    def parse_sale_items(self, page: Page) -> list[dict[str, Any]]:
        """Parse <Store Name> weekly ad."""
        items: list[dict[str, Any]] = []
        html = page.content()
        soup = BeautifulSoup(html, "html.parser")

        for card in soup.select("<CARD_SELECTOR>"):
            product_name = self._text(card, "<NAME_SELECTOR>")
            if not product_name:
                continue

            items.append({
                "product_name": product_name,
                "sale_price_raw": self._text(card, "<PRICE_SELECTOR>") or "",
                "regular_price_raw": self._text(card, "<REG_PRICE_SELECTOR>") or "",
                "category_raw": self._text(card, "<CATEGORY_SELECTOR>"),
                "image_url": self._attr(card, "img", "src")
                             or self._attr(card, "img", "data-src"),
                "raw_description": card.get_text(separator=" ", strip=True)[:500],
            })

        logger.debug("%s: found %d raw items", self.chain_key, len(items))
        return items

    @staticmethod
    def _text(parent: Any, selector: str) -> str | None:
        el = parent.select_one(selector)
        return el.get_text(strip=True) if el else None

    @staticmethod
    def _attr(parent: Any, selector: str, attr: str) -> str | None:
        el = parent.select_one(selector)
        return el.get(attr) if el else None
```

### 2.2 Register in SCRAPER_MAP

`apps/scraper/src/runner.py`:
```python
from .scrapers.<chain_key> import <n>Scraper

SCRAPER_MAP = {
    "kroger":  KrogerScraper,
    "safeway": SafewayScraper,
    "aldi":    AldiScraper,
    "<chain_key>": <n>Scraper,   # ← ADD THIS
}
```

---

## Phase 3: Write Tests

### 3.1 Create Test Class

Add to `apps/scraper/tests/test_scrapers.py`:

```python
class Test<n>Scraper:
    def setup_method(self):
        self.scraper = <n>Scraper(
            store_id=FAKE_STORE_ID,
            scrape_url="https://example.com",
            scrape_config={"crawl_delay_ms": 0},
        )

    def test_parse_empty_page_returns_empty_list(self):
        page = make_page("<html><body></body></html>")
        items = self.scraper.parse_sale_items(page)
        assert items == []

    def test_parse_known_product_card(self):
        # Use a minimal HTML snippet from the real page
        html = """
        <div class="<CARD_SELECTOR>">
          <span class="<NAME_SELECTOR>">Chicken Breast</span>
          <span class="<PRICE_SELECTOR>">$1.99/lb</span>
          <span class="<REG_PRICE_SELECTOR>">$3.49/lb</span>
        </div>
        """
        items = self.scraper.parse_sale_items(make_page(html))
        assert len(items) == 1
        assert "Chicken" in items[0]["product_name"]

    def test_normalize_item_sets_category(self):
        raw = {
            "product_name": "Broccoli Crowns",
            "sale_price_raw": "$0.99/lb",
            "regular_price_raw": "$1.49/lb",
            "category_raw": None,
            "image_url": None,
        }
        item = self.scraper.normalize_item(raw)
        assert item.category == "produce"

    def test_normalize_item_x_for_y_price(self):
        raw = {
            "product_name": "Greek Yogurt 32oz",
            "sale_price_raw": "2 for $5",
            "regular_price_raw": "$3.49",
            "category_raw": None,
            "image_url": None,
        }
        item = self.scraper.normalize_item(raw)
        assert item.sale_price == 2.50
        assert item.regular_price == 3.49

    def test_normalize_item_week_of_is_monday(self):
        raw = {"product_name": "Apples", "sale_price_raw": "$1.99",
               "regular_price_raw": "", "category_raw": None, "image_url": None}
        item = self.scraper.normalize_item(raw)
        assert item.week_of.weekday() == 0  # Monday = 0

    def test_fixture_parse(self):
        html = load_fixture("<chain_key>_weekly_ad.html")
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
        assert isinstance(items, list)
        # If fixture exists, should have items:
        if len(html) > 1000:
            assert len(items) > 0
```

### 3.2 Run Tests
```bash
cd apps/scraper
poetry run pytest tests/test_scrapers.py::Test<n>Scraper -v
```
All tests must pass before proceeding.

---

## Phase 4: Database Setup

### 4.1 Create Migration (or add to seed)

Create `supabase/migrations/00N_add-<chain-key>-store.sql`:

```sql
INSERT INTO stores (name, chain_key, scrape_url, scrape_config)
VALUES (
  '<Store Name>',
  '<chain_key>',
  '<weekly_ad_url>',
  '{
    "type": "playwright",
    "wait_selector": "<WAIT_SELECTOR>",
    "crawl_delay_ms": 3000
  }'::jsonb
)
ON CONFLICT (chain_key) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM stores WHERE chain_key = '<chain_key>';
```

Apply locally:
```bash
cd supabase && npx supabase db push
```

Confirm the store row exists:
```sql
SELECT id, name, chain_key, is_active FROM stores ORDER BY name;
```

---

## Phase 5: End-to-End Verification

### 5.1 Run Live Scrape Locally

```bash
cd apps/scraper

# Start the FastAPI server:
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
SCRAPER_SECRET=local-dev-secret \
ALERT_WEBHOOK_URL= \
poetry run python -m src.server &

# Trigger the scrape:
curl -X POST http://localhost:8080/scrape/trigger \
  -H "X-Scraper-Secret: local-dev-secret"
```

### 5.2 Verify Health Check

```sql
-- Run in Supabase Studio or psql:
SELECT
  s.name,
  COUNT(si.id) AS item_count,
  MAX(si.sale_price) AS max_price,
  MIN(si.sale_price) AS min_price
FROM stores s
JOIN sale_items si ON si.store_id = s.id
WHERE s.chain_key = '<chain_key>'
  AND si.week_of = date_trunc('week', now())::date + 1
GROUP BY s.name;
```

**Expected:** `item_count >= 20`

### 5.3 Verify Normalization Quality

Spot-check 5 items:
```sql
SELECT product_name, normalized_name, category, sale_price, unit
FROM sale_items si
JOIN stores s ON s.id = si.store_id
WHERE s.chain_key = '<chain_key>'
ORDER BY RANDOM()
LIMIT 5;
```

Check:
- `normalized_name` is lowercase, no brand noise, no parentheticals
- `category` is not null for most items
- `sale_price` is a reasonable number (not $0, not $9999)

### 5.4 Verify Recipe Matching

```sql
SELECT COUNT(*) AS matched_recipes
FROM get_recipes_matching_sale_items(
  ARRAY(SELECT id FROM stores WHERE chain_key = '<chain_key>'),
  date_trunc('week', now())::date + 1
);
-- Should be >= 7 for plan generation to work
```

---

## Phase 6: Open PR

### PR Checklist
```
□ Scraper file: apps/scraper/src/scrapers/<chain_key>.py
□ Registered in: apps/scraper/src/runner.py SCRAPER_MAP
□ Fixture: apps/scraper/tests/fixtures/<chain_key>_weekly_ad.html
□ Tests: Test<n>Scraper class in test_scrapers.py — all passing
□ Migration: supabase/migrations/00N_add-<chain-key>-store.sql
□ Health verified: item_count >= 20 in local DB
□ Recipe matching verified: >= 7 recipes matched
□ poetry run pytest passes
□ ruff check . && black --check . passes
```

### PR Title
```
feat(scraper): add <Store Name> grocery chain scraper
```

### PR Description Template
```markdown
## Summary
Adds scraper for <Store Name> weekly ads.

## Store Details
- Chain key: `<chain_key>`
- Weekly ad URL: <url>
- Selector strategy: <brief description>
- Items scraped (local test): <N>

## Special Handling
<Any lazy-loading, scrolling, or timing quirks>

## Testing
- Unit tests: <N> passing
- Fixture: captured from live site on YYYY-MM-DD
- Health check: <N> items in local DB
- Recipe matching: <N> matched recipes
```

---

## Troubleshooting

**0 items scraped:**
- Did the page load before parsing? Increase `crawl_delay_ms` or add explicit `wait_for_selector`
- Is content server-rendered or client-rendered? Check `page.content()` before JS runs
- Are you selecting the right container? Try broader selectors first

**Items found but product_name is None:**
- Name selector is wrong — inspect the saved fixture HTML
- Name may be in an attribute: `card.get("aria-label")` vs text content

**Price not parsed:**
- Check the raw string: `items[0]["sale_price_raw"]`
- Add new pattern to `extract_price()` in `normalizer.py` if needed

**Category always None:**
- `infer_category()` works on `normalized_name` — check what keywords are missing
- Add keywords to `CATEGORY_MAP` in `normalizer.py`

**Cloudflare or bot detection:**
- Try adding headers: `Accept-Language`, `Accept`, `Referer`
- Consider using a residential proxy or managed scraping service
- Escalate to human: may need Apify or ScrapingBee integration
