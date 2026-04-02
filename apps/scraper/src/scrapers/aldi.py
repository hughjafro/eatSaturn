"""Aldi weekly specials scraper."""
from __future__ import annotations

import logging
from typing import Any

from playwright.sync_api import Page
from bs4 import BeautifulSoup

from ..base_scraper import BaseScraper

logger = logging.getLogger(__name__)


class AldiScraper(BaseScraper):
    chain_key = "aldi"

    def _fetch_page(self, browser: Any) -> Page:
        """Aldi's page needs extra scroll to trigger lazy-loaded products."""
        page = super()._fetch_page(browser)
        # Scroll down to trigger lazy loading
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(2000)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        return page

    def parse_sale_items(self, page: Page) -> list[dict[str, Any]]:
        """Parse Aldi's weekly specials page."""
        items: list[dict[str, Any]] = []

        html = page.content()
        soup = BeautifulSoup(html, "html.parser")

        # Aldi product tile selectors
        for card in soup.select(".product-tile, .specials-item, [data-testid='product']"):
            product_name = (
                self._text(card, ".product-title, h3, .item-name")
            )
            if not product_name:
                continue

            sale_price_raw = self._text(card, ".product-price, .price, .sale-price")
            regular_price_raw = self._text(card, ".regular-price, .was-price")
            category_raw = self._text(card, ".product-category, .category")
            image_url = self._attr(card, "img", "src") or self._attr(card, "img", "data-src")

            items.append({
                "product_name": product_name,
                "sale_price_raw": sale_price_raw or "",
                "regular_price_raw": regular_price_raw or "",
                "category_raw": category_raw,
                "image_url": image_url,
                "raw_description": card.get_text(separator=" ", strip=True)[:500],
            })

        logger.debug("Aldi: found %d raw items", len(items))
        return items

    @staticmethod
    def _text(parent: Any, selector: str) -> str | None:
        el = parent.select_one(selector)
        return el.get_text(strip=True) if el else None

    @staticmethod
    def _attr(parent: Any, selector: str, attr: str) -> str | None:
        el = parent.select_one(selector)
        return el.get(attr) if el else None
