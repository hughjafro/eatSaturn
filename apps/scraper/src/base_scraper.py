"""
Abstract base class for all CartSpoon store scrapers.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from playwright.sync_api import sync_playwright, Page, Browser

from .models import SaleItem
from .normalizer import normalize_name, extract_unit, extract_price, infer_category, strip_quantity_from_name

logger = logging.getLogger(__name__)


def current_week_monday() -> date:
    """Return the Monday of the current week as the canonical week_of date."""
    today = date.today()
    return today - timedelta(days=today.weekday())


class BaseScraper(ABC):
    """
    All store scrapers inherit from this class.
    Subclasses must implement `parse_sale_items()`.
    """

    chain_key: str  # e.g. "kroger"

    def __init__(self, store_id: UUID, scrape_url: str, scrape_config: dict[str, Any]):
        self.store_id = store_id
        self.scrape_url = scrape_url
        self.scrape_config = scrape_config
        self.week_of = current_week_monday()
        self._crawl_delay_ms = scrape_config.get("crawl_delay_ms", 3000)

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------
    def scrape(self) -> list[SaleItem]:
        """Fetch the weekly ad page and return parsed, normalized SaleItems."""
        logger.info("Scraping %s for week of %s", self.chain_key, self.week_of)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                page = self._fetch_page(browser)
                raw_items = self.parse_sale_items(page)
            finally:
                browser.close()

        normalized = [self.normalize_item(item) for item in raw_items]
        logger.info("Scraped %d items from %s", len(normalized), self.chain_key)
        return normalized

    # ------------------------------------------------------------------
    # Must be implemented by subclasses
    # ------------------------------------------------------------------
    @abstractmethod
    def parse_sale_items(self, page: Page) -> list[dict[str, Any]]:
        """
        Parse the Playwright Page and return a list of raw dicts with keys:
          product_name, sale_price_raw, regular_price_raw, category_raw, image_url
        """

    # ------------------------------------------------------------------
    # Default implementations (subclasses may override)
    # ------------------------------------------------------------------
    def _fetch_page(self, browser: Browser) -> Page:
        """Navigate to the scrape URL and wait for the content selector."""
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        wait_selector = self.scrape_config.get("wait_selector", "body")
        page.goto(self.scrape_url, wait_until="domcontentloaded", timeout=30_000)
        try:
            page.wait_for_selector(wait_selector, timeout=15_000)
        except Exception:
            logger.warning("%s: wait_selector '%s' not found — proceeding anyway", self.chain_key, wait_selector)
        page.wait_for_timeout(self._crawl_delay_ms)
        return page

    def normalize_item(self, raw: dict[str, Any]) -> SaleItem:
        """
        Convert a raw scraper dict into a SaleItem with normalized fields.
        Subclasses can override for chain-specific logic.
        """
        product_name: str = raw.get("product_name", "").strip()
        norm_name = normalize_name(product_name)
        # Strip quantity from normalized name to get core ingredient name
        ingredient_name = strip_quantity_from_name(norm_name)

        qty_str, unit = extract_unit(product_name)
        if unit is None:
            unit = raw.get("unit")

        sale_price = extract_price(raw.get("sale_price_raw", ""))
        regular_price = extract_price(raw.get("regular_price_raw", ""))

        category = infer_category(norm_name) or raw.get("category_raw")

        return SaleItem(
            store_id=self.store_id,
            week_of=self.week_of,
            product_name=product_name,
            normalized_name=ingredient_name or norm_name,
            category=category,
            unit=unit,
            sale_price=sale_price,
            regular_price=regular_price,
            raw_description=raw.get("raw_description"),
            image_url=raw.get("image_url"),
        )
