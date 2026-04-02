"""Safeway weekly ad scraper."""
from __future__ import annotations

import logging
from typing import Any

from playwright.sync_api import Page
from bs4 import BeautifulSoup

from ..base_scraper import BaseScraper

logger = logging.getLogger(__name__)


class SafewayScraper(BaseScraper):
    chain_key = "safeway"

    def parse_sale_items(self, page: Page) -> list[dict[str, Any]]:
        """Parse Safeway's weekly ad page."""
        items: list[dict[str, Any]] = []

        html = page.content()
        soup = BeautifulSoup(html, "html.parser")

        # Safeway weekly ad item selectors (may need updating as site changes)
        for card in soup.select(".weekly-ad-item, .product-item, [data-testid='product-card']"):
            product_name = (
                self._text(card, ".item-title, .product-name, h3")
            )
            if not product_name:
                continue

            sale_price_raw = self._text(card, ".item-price, .sale-price, .price")
            regular_price_raw = self._text(card, ".reg-price, .regular-price, .was-price")
            category_raw = self._text(card, ".item-category, .category-name")
            image_url = self._attr(card, "img", "src")

            items.append({
                "product_name": product_name,
                "sale_price_raw": sale_price_raw or "",
                "regular_price_raw": regular_price_raw or "",
                "category_raw": category_raw,
                "image_url": image_url,
                "raw_description": card.get_text(separator=" ", strip=True)[:500],
            })

        logger.debug("Safeway: found %d raw items", len(items))
        return items

    @staticmethod
    def _text(parent: Any, selector: str) -> str | None:
        el = parent.select_one(selector)
        return el.get_text(strip=True) if el else None

    @staticmethod
    def _attr(parent: Any, selector: str, attr: str) -> str | None:
        el = parent.select_one(selector)
        return el.get(attr) if el else None
