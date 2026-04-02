-- Seed stores table with the 3 MVP chains

INSERT INTO stores (id, name, chain_key, scrape_url, scrape_config) VALUES
(
  gen_random_uuid(),
  'Kroger',
  'kroger',
  'https://www.kroger.com/weeklyad',
  '{
    "type": "playwright",
    "wait_selector": "[data-testid=\"weekly-ad\"]",
    "item_selector": ".kds-Price",
    "product_name_selector": ".kds-Price-promotional",
    "price_selector": ".kds-Price-promotional-price",
    "category_selector": ".kds-Price-category",
    "crawl_delay_ms": 3000
  }'::jsonb
),
(
  gen_random_uuid(),
  'Safeway',
  'safeway',
  'https://www.safeway.com/weeklyad',
  '{
    "type": "playwright",
    "wait_selector": ".weekly-ad-container",
    "item_selector": ".weekly-ad-item",
    "product_name_selector": ".item-title",
    "price_selector": ".item-price",
    "category_selector": ".item-category",
    "crawl_delay_ms": 3000
  }'::jsonb
),
(
  gen_random_uuid(),
  'Aldi',
  'aldi',
  'https://www.aldi.us/en/weekly-specials/',
  '{
    "type": "playwright",
    "wait_selector": ".aldi-weekly-specials",
    "item_selector": ".product-tile",
    "product_name_selector": ".product-title",
    "price_selector": ".product-price",
    "category_selector": ".product-category",
    "crawl_delay_ms": 4000
  }'::jsonb
);
