# CartSpoon Scraper — Claude Context

> Python scraper service context. Supplements root `CLAUDE.md`.
> Read both. Root CLAUDE.md has the full stack overview and NEVER DO rules.
> This file covers scraper-specific patterns, Python conventions, and Fly.io ops.

---

## Service Overview

FastAPI service + APScheduler running in a single process on Fly.io.
Scrapes grocery store weekly ads every Sunday at 23:00 ET.
Writes normalized sale items to Supabase via direct Postgres connection (psycopg2).
Exposes a manual trigger endpoint at `POST /scrape/trigger`.

---

## Project Structure

```
apps/scraper/
├── src/
│   ├── __init__.py
│   ├── server.py          # FastAPI app — /health, /scrape/trigger
│   ├── scheduler.py       # APScheduler cron — Sunday 23:00 ET
│   ├── runner.py          # Orchestrates all scrapers, health checks, alerts
│   ├── base_scraper.py    # Abstract base class — all scrapers extend this
│   ├── normalizer.py      # Name/price/category/unit normalization
│   ├── db_writer.py       # Supabase upsert via psycopg2
│   ├── models.py          # Pydantic models: SaleItem, Recipe, RecipeIngredient
│   ├── alerting.py        # Slack/Discord webhook alerts
│   ├── recipe_importer.py # One-time Spoonacular import script
│   └── scrapers/
│       ├── __init__.py
│       ├── kroger.py
│       ├── safeway.py
│       └── aldi.py
├── tests/
│   ├── __init__.py
│   ├── fixtures/          # Saved HTML snapshots for fixture-based tests
│   ├── test_normalizer.py
│   └── test_scrapers.py
├── Dockerfile
└── pyproject.toml
```

---

## Python Conventions

### Type Hints
All function signatures require type hints:
```python
# ✅ Correct
def normalize_name(raw: str) -> str:

def write_sale_items(items: list[SaleItem]) -> int:

# ❌ Wrong — no hints
def normalize_name(raw):
```

Use `from __future__ import annotations` at the top of every file.
This enables forward references and makes type hints lazy-evaluated.

### Error Handling
```python
# ✅ Catch specific exceptions
try:
    items = scraper.scrape()
except TimeoutError as exc:
    logger.error("Timeout scraping %s: %s", chain_key, exc)
    send_alert(f"Timeout: {chain_key}")

# ❌ Never bare except
try:
    items = scraper.scrape()
except:  # catches KeyboardInterrupt, SystemExit — very bad
    pass
```

### Logging
```python
import logging
logger = logging.getLogger(__name__)

# Use % formatting (not f-strings) in logger calls — lazy evaluation
logger.info("Scraped %d items from %s", len(items), chain_key)
logger.error("Failed for %s: %s", chain_key, exc, exc_info=True)  # exc_info for stack trace
```

### Pydantic Models
All data going into the DB must pass through the `SaleItem` Pydantic model:
```python
from .models import SaleItem

item = SaleItem(
    store_id=self.store_id,
    week_of=self.week_of,
    product_name=raw["product_name"],
    normalized_name=ingredient_name or norm_name,
    # ...
)
```
Pydantic validates types on construction — catches bad data before DB write.

---

## BaseScraper Contract

Every scraper **must**:
1. Inherit from `BaseScraper`
2. Set `chain_key` as a class attribute
3. Implement `parse_sale_items(self, page: Page) -> list[dict[str, Any]]`
4. Return dicts with these keys: `product_name`, `sale_price_raw`, `regular_price_raw`, `category_raw`, `image_url`, `raw_description`

The base class handles: Playwright launch, page navigation, `crawl_delay_ms`, and normalization via `normalize_item()`.

Override `_fetch_page()` only for special cases (Aldi's lazy-loading scroll).

```python
class NewStoreScraper(BaseScraper):
    chain_key = "newstore"

    def parse_sale_items(self, page: Page) -> list[dict[str, Any]]:
        html = page.content()
        soup = BeautifulSoup(html, "html.parser")
        items = []
        for card in soup.select(".product-card"):
            name = self._text(card, ".product-name")
            if not name:
                continue
            items.append({
                "product_name": name,
                "sale_price_raw": self._text(card, ".sale-price") or "",
                "regular_price_raw": self._text(card, ".reg-price") or "",
                "category_raw": self._text(card, ".category"),
                "image_url": self._attr(card, "img", "src"),
                "raw_description": card.get_text(separator=" ", strip=True)[:500],
            })
        return items
```

---

## Normalizer Module

`normalizer.py` is the source of truth for data transformation.
All normalization happens here — never in the scraper classes.

Key functions:
```python
normalize_name(raw: str) -> str
    # Lowercase, strip parens, strip brand noise, collapse whitespace

extract_unit(raw: str) -> tuple[str | None, str | None]
    # Returns (quantity_string, unit_string) e.g. ("3", "lb")

extract_price(raw: str) -> float | None
    # Handles "$3.99", "2 for $5", "3/$9" → float

infer_category(normalized_name: str) -> str | None
    # Keyword match against CATEGORY_MAP

strip_quantity_from_name(name: str) -> str
    # Removes "3 lb" patterns → core ingredient name
```

When adding a new keyword pattern, add it to `CATEGORY_MAP` or `UNIT_PATTERN`
in `normalizer.py`. Do NOT add chain-specific normalization in scraper classes.

---

## Database Writer

`db_writer.py` uses **psycopg2** (not Supabase client) for direct Postgres connection.
All writes are upserts — re-running scrapers is always safe:

```python
# UNIQUE(store_id, week_of, normalized_name) constraint
# ON CONFLICT: update all fields except the unique key
UPSERT_SQL = """
INSERT INTO sale_items (store_id, week_of, ...)
VALUES %s
ON CONFLICT (store_id, week_of, normalized_name)
DO UPDATE SET sale_price = EXCLUDED.sale_price, ...
"""
```

Connection uses `DATABASE_URL` env var (direct Postgres, not REST API).
Format: `postgresql://postgres:<password>@<host>:5432/postgres`

---

## Health Check System

After every scrape, `runner.py` calls `count_sale_items(store_id, week_of)`.
If count < `HEALTH_MIN_ITEMS` (20), fires `send_alert()`.

```python
# runner.py
HEALTH_MIN_ITEMS = 20

actual_count = count_sale_items(str(store["id"]), week_of)
if actual_count < HEALTH_MIN_ITEMS:
    send_alert(
        f"WARNING: {store['name']} scraped only {actual_count} items "
        f"for week {week_of} (minimum expected: {HEALTH_MIN_ITEMS})"
    )
```

`ALERT_WEBHOOK_URL` env var: Slack/Discord webhook URL.
If not set, alert logs a warning and continues silently (no crash).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Direct Postgres connection string |
| `SCRAPER_SECRET` | Yes | Protects `POST /scrape/trigger` |
| `ALERT_WEBHOOK_URL` | No | Slack/Discord webhook for alerts |
| `SPOONACULAR_API_KEY` | One-time | Recipe import only |

---

## Running Locally

```bash
cd apps/scraper
poetry install

# Start FastAPI server:
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
SCRAPER_SECRET=local-dev-secret \
poetry run uvicorn src.server:app --host 0.0.0.0 --port 8080

# Run scheduler (blocks):
DATABASE_URL=... poetry run python -m src.scheduler

# Run tests (no network calls):
poetry run pytest -v

# Lint + format:
ruff check .
black .
```

---

## Fly.io Deployment

```bash
# From apps/scraper/:
flyctl deploy

# Check status:
flyctl status --app cartspoon-scraper

# Stream logs:
flyctl logs --app cartspoon-scraper

# SSH into running instance:
flyctl ssh console --app cartspoon-scraper

# Scale (if needed):
flyctl scale count 1 --app cartspoon-scraper  # single instance is fine
```

Fly.io config is in `fly.toml` (not yet committed — create at root of apps/scraper/).
The Dockerfile uses `uvicorn` as the entrypoint — both FastAPI and APScheduler
run in the same process via the embedded scheduler in `server.py`.

---

## Adding a New Scraper — Quick Reference

1. Create `src/scrapers/<chain_key>.py` extending `BaseScraper`
2. Set `chain_key = "<chain_key>"` class attribute
3. Implement `parse_sale_items(self, page)` returning `list[dict]`
4. Add to `SCRAPER_MAP` in `runner.py`
5. Add store row to DB via migration (see `skills/add-grocery-chain/SKILL.md`)
6. Create `tests/fixtures/<chain_key>_weekly_ad.html`
7. Add `Test<n>Scraper` class to `test_scrapers.py`
8. Run `poetry run pytest` — all tests must pass
9. Trigger manually and verify `count_sale_items() >= 20`

---

## Common Mistakes in This Codebase

- Putting normalization logic in scraper classes — it belongs in `normalizer.py`
- Setting `crawl_delay_ms` below 2000 — causes rate limit issues
- Catching bare `except:` — always catch specific exception types
- Using f-strings in `logger.*()` calls — use `%s` formatting instead
- Forgetting `from __future__ import annotations` — causes type hint issues on Python 3.9
- Using the Supabase REST client instead of psycopg2 — the scraper uses direct Postgres
- Not checking `robots.txt` before adding a new grocery chain
