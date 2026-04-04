# Grocery Data Specification

> Defines how grocery store weekly ad data is scraped, normalized,
> stored, and matched against recipes. The canonical reference for
> anyone touching scrapers, the normalizer, or the matching function.

---

## SaleItem Schema

Defined in `apps/scraper/src/models.py` and mirrored in `supabase/migrations/001_initial_schema.sql`.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | UUID | No | Auto-generated primary key |
| `store_id` | UUID (FK) | No | References `stores.id` |
| `week_of` | DATE | No | Always a **Monday** date |
| `product_name` | TEXT | No | Raw product name as scraped |
| `normalized_name` | TEXT | No | Canonical ingredient key (see pipeline below) |
| `category` | TEXT | Yes | Inferred category (see Category Map) |
| `unit` | TEXT | Yes | Extracted unit (lb, oz, ct, gal, etc.) |
| `sale_price` | NUMERIC(8,2) | Yes | Per-unit sale price in USD |
| `regular_price` | NUMERIC(8,2) | Yes | Per-unit regular price in USD |
| `discount_pct` | NUMERIC(5,2) | Yes | Auto-computed by DB trigger — never set manually |
| `raw_description` | TEXT | Yes | Full card text, max 500 chars |
| `image_url` | TEXT | Yes | Product image URL |
| `created_at` | TIMESTAMPTZ | No | Auto-set on insert |

**Uniqueness constraint:** `UNIQUE(store_id, week_of, normalized_name)`
All scraper upserts are idempotent — re-running never creates duplicates.

---

## Normalization Pipeline

Every raw product name flows through this pipeline before storage.
All logic lives in `apps/scraper/src/normalizer.py`.

```
Raw Input: "Boneless Skinless Chicken Breast (3 lb pack) - Great Value"
                          │
                          ▼
1. normalize_name()
   - Lowercase
   - Strip parenthetical content: "(3 lb pack)" → removed
   - Strip brand noise: "Great Value", "Signature Select", "Simply",
     "Organic", "Store Brand" → removed
   - Collapse whitespace
   Result: "boneless skinless chicken breast"
                          │
                          ▼
2. extract_unit()
   - Match UNIT_PATTERN regex against raw input
   - Returns: qty="3", unit="lb"
   - If no match: (None, None)
                          │
                          ▼
3. strip_quantity_from_name()
   - Remove quantity+unit patterns from normalized name
   - "boneless skinless chicken breast 3 lb" → "boneless skinless chicken breast"
   Result: normalized_name = "boneless skinless chicken breast"
                          │
                          ▼
4. infer_category()
   - Keyword match against CATEGORY_MAP
   - "chicken" → "meat"
   Result: category = "meat"
                          │
                          ▼
5. extract_price() — applied to sale_price_raw and regular_price_raw
   - "$1.99/lb" → 1.99
   - "2 for $5" → 2.50  (divides total by count)
   - "3/$9" → 3.00
   - "BOGO" → None (cannot normalize)
   Result: sale_price = 1.99, regular_price = 3.49
```

### Final SaleItem stored:
```
product_name:    "Boneless Skinless Chicken Breast (3 lb pack) - Great Value"
normalized_name: "boneless skinless chicken breast"
category:        "meat"
unit:            "lb"
sale_price:      1.99
regular_price:   3.49
discount_pct:    [auto-computed by trigger: 42.94]
```

---

## Price Parsing Rules

All handled by `extract_price()` in `normalizer.py`.

| Raw String | Parsed Value | Logic |
|---|---|---|
| `$3.99` | 3.99 | Direct match |
| `$3.99/lb` | 3.99 | Strip `/lb` suffix |
| `2 for $5` | 2.50 | total ÷ count |
| `3/$9` | 3.00 | total ÷ count |
| `2/$5.00` | 2.50 | total ÷ count |
| `10 for $10` | 1.00 | total ÷ count |
| `BOGO` | None | Skip — not parseable |
| `Save $1.00` | None | Skip — relative, not absolute |
| `(empty string)` | None | Skip |

---

## Category Map

Defined in `CATEGORY_MAP` dict in `normalizer.py`. Keyword matching is
substring-based on the normalized product name. First match wins.

| Category | Sample Keywords |
|---|---|
| `produce` | apple, banana, broccoli, carrot, spinach, tomato, onion, pepper, avocado |
| `meat` | chicken, beef, pork, turkey, salmon, shrimp, steak, bacon, ham, lamb |
| `dairy` | milk, butter, cheese, yogurt, cream, egg, eggs, cottage cheese |
| `bakery` | bread, roll, bagel, tortilla, muffin, croissant, bun, cake, pie |
| `pantry` | pasta, rice, flour, oil, sauce, canned, bean, soup, broth, cereal, nut |
| `frozen` | frozen, ice cream, pizza, nugget, waffle, tater tot |
| `beverages` | juice, soda, water, coffee, tea, beer, wine, energy drink |
| `household` | detergent, soap, shampoo, paper towel, napkin, plastic bag |

**Adding keywords:** Edit `CATEGORY_MAP` in `normalizer.py` and add a matching
synonym to `ingredient_synonyms` table if the new keyword represents a known
ingredient alias.

---

## Unit Reference

Extracted by `extract_unit()` using `UNIT_PATTERN` regex.

| Canonical Unit | Raw Variants Matched |
|---|---|
| `lb` | lb, lbs, pound, pounds |
| `oz` | oz, ozs, fl oz, fluid oz |
| `ct` | ct, count |
| `pk` | pk, pack |
| `gal` | gal, gallon, gallons |
| `qt` | qt, qts, quart |
| `pt` | pt, pts, pint |
| `g` | g (grams) |
| `kg` | kg |
| `ml` | ml |
| `l` | l (liters) |

---

## Ingredient Synonym Table

`ingredient_synonyms` table maps aliases to canonical names for fuzzy
matching improvement. Used by `get_recipes_matching_sale_items()`.

Example entries (seeded in `002_functions.sql`):

| Synonym | Canonical |
|---|---|
| `boneless skinless chicken breast` | `chicken breast` |
| `ground chuck` | `ground beef` |
| `80/20 ground beef` | `ground beef` |
| `atlantic salmon` | `salmon` |
| `extra virgin olive oil` | `olive oil` |
| `long grain white rice` | `rice` |
| `broccoli florets` | `broccoli` |

**Adding synonyms:** Insert a row into `ingredient_synonyms` via migration.
The `get_recipes_matching_sale_items()` function joins against this table
before running trgm similarity.

---

## Fuzzy Matching Logic

The core matching function is `get_recipes_matching_sale_items()` in
`supabase/migrations/002_functions.sql`.

```sql
-- Simplified logic:
JOIN sale_items si
  ON similarity(ri.normalized_name, si.normalized_name) >= 0.4
```

**Threshold: 0.4** — tunable via `p_similarity_threshold` parameter.
- Too high (> 0.6): misses valid matches ("chicken breast" ≠ "boneless chicken breast")
- Too low (< 0.3): false positives ("beef" matches "beef broth" for a cake recipe)

**pg_trgm** requires the extension enabled (migration 001) and GIN indexes
on both `normalized_name` columns.

---

## Scraper Health Standard

After every scrape run, `runner.py` calls `count_sale_items()` per store.

| Threshold | Action |
|---|---|
| ≥ 20 items | ✅ Healthy — no action |
| < 20 items | 🚨 Alert fired via `ALERT_WEBHOOK_URL` |
| 0 items | 🚨 Alert fired — scraper likely broken |

`HEALTH_MIN_ITEMS = 20` is defined in `runner.py`. Adjust per chain if
a store consistently has fewer than 20 weekly specials.

---

## week_of Convention

**Rule:** `week_of` is always the **Monday** of the current week.

```python
# Python (scraper) — base_scraper.py
def current_week_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())

# TypeScript (web) — lib/dates.ts
export function getMondayOfCurrentWeek(): string {
    const today = new Date();
    const day = today.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return monday.toISOString().split("T")[0];
}
```

**Never** hardcode a date string for `week_of`. Both functions must agree.
Scrapers run Sunday night and write with the upcoming Monday's date.

---

## Store Configuration (`scrape_config` JSONB)

Each store row in the `stores` table has a `scrape_config` JSONB field:

```json
{
  "type": "playwright",
  "wait_selector": ".product-tile",
  "item_selector": ".product-tile",
  "product_name_selector": ".product-title",
  "price_selector": ".product-price",
  "category_selector": ".product-category",
  "crawl_delay_ms": 3000
}
```

| Key | Description | Default |
|---|---|---|
| `type` | Scraper type (always `playwright`) | `playwright` |
| `wait_selector` | CSS selector to wait for before parsing | `body` |
| `crawl_delay_ms` | Ms to wait after page load | `3000` |
| `item_selector` | CSS selector for product card containers | — |

The scraper class itself owns the specific parsing selectors —
`scrape_config` stores only the infrastructure-level settings.
