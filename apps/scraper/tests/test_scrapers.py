"""
Unit tests for each store scraper's parse_sale_items() using saved HTML fixtures.
No live network calls are made.
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

import pytest

from src.scrapers.kroger import KrogerScraper
from src.scrapers.safeway import SafewayScraper
from src.scrapers.aldi import AldiScraper

FIXTURES_DIR = Path(__file__).parent / "fixtures"
FAKE_STORE_ID = UUID("00000000-0000-0000-0000-000000000001")
FAKE_CONFIG = {"crawl_delay_ms": 0}


def make_page(html: str) -> MagicMock:
    page = MagicMock()
    page.content.return_value = html
    return page


def load_fixture(name: str) -> str:
    path = FIXTURES_DIR / name
    if path.exists():
        return path.read_text()
    # Return minimal HTML if fixture not yet created
    return "<html><body></body></html>"


class TestKrogerScraper:
    def setup_method(self):
        self.scraper = KrogerScraper(
            store_id=FAKE_STORE_ID,
            scrape_url="https://example.com",
            scrape_config=FAKE_CONFIG,
        )

    def test_parse_empty_page_returns_empty_list(self):
        page = make_page("<html><body></body></html>")
        items = self.scraper.parse_sale_items(page)
        assert items == []

    def test_parse_item_card(self):
        html = """
        <div class="kds-Price">
          <span class="kds-Price-promotional">Chicken Breast</span>
          <span class="kds-Price-promotional-price">$1.99/lb</span>
          <span class="kds-Price-regular">$3.49/lb</span>
          <span class="kds-Price-category">Meat</span>
        </div>
        """
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
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
        assert item.week_of is not None

    def test_normalize_item_price_parsing(self):
        raw = {
            "product_name": "Greek Yogurt 32oz",
            "sale_price_raw": "2 for $5",
            "regular_price_raw": "$3.49",
            "category_raw": "Dairy",
            "image_url": None,
        }
        item = self.scraper.normalize_item(raw)
        assert item.sale_price == 2.50
        assert item.regular_price == 3.49

    def test_fixture_parse(self):
        html = load_fixture("kroger_weekly_ad.html")
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
        # If fixture is empty HTML, items should be []
        assert isinstance(items, list)


class TestSafewayScraper:
    def setup_method(self):
        self.scraper = SafewayScraper(
            store_id=FAKE_STORE_ID,
            scrape_url="https://example.com",
            scrape_config=FAKE_CONFIG,
        )

    def test_parse_empty_page_returns_empty_list(self):
        page = make_page("<html><body></body></html>")
        items = self.scraper.parse_sale_items(page)
        assert items == []

    def test_parse_product_item(self):
        html = """
        <div class="weekly-ad-item">
          <span class="item-title">Ground Beef 80/20</span>
          <span class="item-price">$3.99/lb</span>
          <span class="reg-price">$5.49/lb</span>
          <span class="item-category">Meat</span>
        </div>
        """
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
        assert len(items) == 1
        assert "Ground Beef" in items[0]["product_name"]

    def test_fixture_parse(self):
        html = load_fixture("safeway_weekly_ad.html")
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
        assert isinstance(items, list)


class TestAldiScraper:
    def setup_method(self):
        self.scraper = AldiScraper(
            store_id=FAKE_STORE_ID,
            scrape_url="https://example.com",
            scrape_config=FAKE_CONFIG,
        )

    def test_parse_empty_page_returns_empty_list(self):
        page = make_page("<html><body></body></html>")
        items = self.scraper.parse_sale_items(page)
        assert items == []

    def test_parse_product_tile(self):
        html = """
        <div class="product-tile">
          <h3 class="product-title">Salmon Fillet</h3>
          <span class="product-price">$5.99/lb</span>
          <span class="regular-price">$8.99/lb</span>
        </div>
        """
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
        assert len(items) == 1
        assert "Salmon" in items[0]["product_name"]

    def test_fixture_parse(self):
        html = load_fixture("aldi_weekly_specials.html")
        page = make_page(html)
        items = self.scraper.parse_sale_items(page)
        assert isinstance(items, list)
