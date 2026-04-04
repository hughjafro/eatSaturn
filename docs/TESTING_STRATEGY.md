# Testing Strategy

> Defines what to test, how to test it, and coverage targets for CartSpoon.
> The goal is fast, reliable tests that catch real bugs without slowing
> development or requiring complex mocks.

---

## Testing Philosophy

CartSpoon has two distinct codebases with different testing needs:

**Python scraper:** Pure unit tests with saved HTML fixtures. No live network
calls ever. Tests must run in < 5 seconds total.

**TypeScript web app:** TypeScript strict mode as the primary correctness
tool. `npx tsc --noEmit` catches most logic errors. Manual smoke tests
for integration flows (auth, payments, plan generation).

---

## Test Pyramid

```
         ▲
        /E2E\          Manual smoke tests on staging
       / (few) \       before every production deploy
      /──────────\
     / Integration \   tRPC type-checking + SQL function tests
    /   (medium)    \  in Supabase Studio
   /──────────────────\
  /     Unit Tests     \  Python normalizer + scraper fixture tests
 /       (many)         \  Fast, isolated, no network
/────────────────────────\
```

---

## Python Scraper Tests

### Location
`apps/scraper/tests/`

### Run
```bash
cd apps/scraper
poetry run pytest                        # all tests
poetry run pytest -v -s                  # verbose with print output
poetry run pytest tests/test_normalizer.py  # single file
poetry run pytest -k "test_extract_price"   # single test by name
```

### Required Coverage

**`test_normalizer.py` — must cover:**
```
□ normalize_name() lowercases input
□ normalize_name() strips parenthetical content
□ normalize_name() strips known brand noise
□ normalize_name() collapses extra whitespace
□ extract_unit() parses "3 lb" → ("3", "lb")
□ extract_unit() parses "32 oz" → ("32", "oz")
□ extract_unit() returns (None, None) for no unit
□ extract_price() parses "$3.99" → 3.99
□ extract_price() parses "2 for $5" → 2.50
□ extract_price() parses "3/$9" → 3.00
□ extract_price() returns None for empty string
□ infer_category() maps "broccoli" → "produce"
□ infer_category() maps "chicken breast" → "meat"
□ infer_category() returns None for unknown
□ strip_quantity_from_name() removes unit pattern
```

**`test_scrapers.py` — for each chain scraper:**
```
□ parse_sale_items() on empty HTML returns []
□ parse_sale_items() on known product card HTML parses product_name
□ normalize_item() sets category correctly via infer_category
□ normalize_item() parses "X for $Y" price format
□ normalize_item() sets week_of correctly (a Monday)
□ Fixture test: parse_sale_items() on captured HTML returns > 0 items
```

### Fixture Pattern
```python
FIXTURES_DIR = Path(__file__).parent / "fixtures"
FAKE_STORE_ID = UUID("00000000-0000-0000-0000-000000000001")
FAKE_CONFIG = {"crawl_delay_ms": 0}  # no delay in tests

def make_page(html: str) -> MagicMock:
    page = MagicMock()
    page.content.return_value = html
    return page

def load_fixture(name: str) -> str:
    path = FIXTURES_DIR / name
    if path.exists():
        return path.read_text()
    return "<html><body></body></html>"  # empty fallback
```

### Adding a Fixture
When a scraper changes or a new chain is added:
1. Run the scraper once with `page.content()` output saved to a file
2. Save to `tests/fixtures/<chain>_weekly_ad.html`
3. Add fixture-based test:
```python
def test_fixture_parse(self):
    html = load_fixture("kroger_weekly_ad.html")
    page = make_page(html)
    items = self.scraper.parse_sale_items(page)
    assert len(items) > 0
    # Spot-check first item has expected fields
    assert items[0]["product_name"]
    assert items[0]["sale_price_raw"]
```

---

## TypeScript / Next.js Tests

### Primary Tool: TypeScript Compiler
```bash
cd apps/web
npx tsc --noEmit
```
Run this before every commit. Zero errors required.

This catches:
- Wrong tRPC procedure return types
- Zod schema mismatches
- Supabase query type errors
- Missing required props on components

### Secondary Tool: Biome
```bash
npm run check   # from repo root
```
Catches code style, import order, unused variables, and formatting.

### What We Do NOT Unit Test (and why)
| Skipped | Reason |
|---|---|
| tRPC procedure logic | Requires Supabase mock; integration-tested manually |
| React component rendering | TypeScript + visual review is sufficient at current scale |
| Claude API calls | Mock at `anthropic.messages.create`; integration-tested manually |
| Stripe webhook handler | Use `stripe trigger` CLI for local testing |
| Supabase queries | Type-checked by tsc + tested manually via Studio |

### When to Add TypeScript Tests
Start adding Vitest unit tests when:
- A utility function has more than 3 edge cases (e.g. `getMondayOfCurrentWeek`)
- A transformation function is used in more than 3 places
- A bug is found in production logic that could have been caught by a unit test

---

## Integration Tests (Manual)

Run these manually before any production deploy. Takes ~10 minutes.

### Auth Flow
```
□ Visit /auth/signup → enter email → check Inbucket (local) or inbox
□ Click magic link → lands on /plan/generate
□ Visit /auth/login with existing account → same flow
□ Google OAuth → redirects to /plan correctly
□ Protected route /account without auth → redirects to /auth/login
```

### Meal Plan Generation
```
□ New user with store selected → /plan/generate → click "Build my plan"
□ Loading states cycle through messages
□ Lands on /plan with 7-day grid populated
□ Each recipe card links to /recipes/[id]
□ /shopping-list loads with items
□ Second click "Generate" → returns cached plan instantly
```

### Premium Upgrade
```
□ /upgrade page loads with both tiers
□ Click "Upgrade now" → Stripe checkout (use card 4242 4242 4242 4242)
□ Return to /account?upgraded=true → Badge shows "Premium"
□ /plan/generate now uses sonnet (check llm_usage_log.model)
□ Dietary preferences accessible in /account
```

### Stripe Webhook (local only)
```bash
stripe trigger checkout.session.completed
# Verify: users.tier = 'premium' for test user
```

---

## SQL Function Testing

Test `get_recipes_matching_sale_items()` directly in Supabase Studio:

```sql
-- Should return recipes if scrapers ran:
SELECT *
FROM get_recipes_matching_sale_items(
  ARRAY(SELECT id FROM stores WHERE chain_key = 'kroger'),
  date_trunc('week', now())::date + 1
)
LIMIT 10;

-- Test with dietary filter:
SELECT COUNT(*)
FROM get_recipes_matching_sale_items(
  ARRAY(SELECT id FROM stores LIMIT 1),
  date_trunc('week', now())::date + 1,
  p_vegan := true
);
-- All returned recipes should have is_vegan = true
```

---

## Pre-PR Checklist

```bash
# TypeScript
cd apps/web && npx tsc --noEmit          # must pass: 0 errors
cd ../.. && npm run check                 # must pass: 0 issues

# Python
cd apps/scraper && poetry run pytest     # must pass: all green
ruff check . && black --check .          # must pass: 0 issues
```

Manual checks:
```
□ No console.log() left in production code
□ No TODO comments in critical paths (OK in tests/docs)
□ No hardcoded dates or UUIDs
□ New table has RLS (migration-reviewer agent)
□ New scraper has fixture + tests
```

---

## CI/CD (Future)

When GitHub Actions are configured, these should run on every PR:

```yaml
# .github/workflows/ci.yml (planned)
jobs:
  web:
    - npm install
    - npx tsc --noEmit
    - npm run check
    - npm run build  # catch build-time errors

  scraper:
    - poetry install
    - ruff check .
    - black --check .
    - pytest --tb=short
```

Until CI is set up, the pre-PR checklist above must be run manually.
