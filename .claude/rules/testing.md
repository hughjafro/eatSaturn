# Rule: Testing

## Coverage Requirements
- Every scraper: fixture-based unit tests + empty-page test
- Every new normalizer function: unit test in `test_normalizer.py`
- Every new tRPC procedure: at least one type-level check (tsc)
- Price parsing: test `$X.XX`, `X for $Y`, `X/$Y` formats

## Python Testing
```bash
cd apps/scraper
poetry run pytest                        # run all tests
poetry run pytest tests/test_normalizer.py  # single file
poetry run pytest -v -s                  # verbose with stdout
```

All tests live in `apps/scraper/tests/`.
Fixtures in `apps/scraper/tests/fixtures/`.

## Scraper Test Pattern
```python
def make_page(html: str) -> MagicMock:
    page = MagicMock()
    page.content.return_value = html
    return page

class TestKrogerScraper:
    def setup_method(self):
        self.scraper = KrogerScraper(FAKE_STORE_ID, "https://example.com", {})

    def test_parse_empty_page_returns_empty_list(self):
        page = make_page("<html><body></body></html>")
        assert self.scraper.parse_sale_items(page) == []

    def test_parse_known_product(self):
        html = "<div class='kds-Price'>...</div>"
        items = self.scraper.parse_sale_items(make_page(html))
        assert len(items) == 1
        assert "Chicken" in items[0]["product_name"]
```

## TypeScript Type Checking (replaces unit tests for tRPC)
```bash
npx tsc --noEmit   # must pass with 0 errors
npm run check      # biome lint + format
```
For complex procedures, test via the running dev server manually.

## Pre-PR Checklist
```
□ npx tsc --noEmit passes
□ npm run check passes
□ poetry run pytest passes
□ No new `any` types introduced
□ New scraper has fixture + tests
```

## What NOT to Test
- Supabase client calls (mock the entire Supabase module instead)
- Claude API calls (mock at the `anthropic.messages.create` level)
- Stripe webhooks (use Stripe CLI for local testing)
- Next.js page rendering (tsc + manual smoke test is sufficient for now)
