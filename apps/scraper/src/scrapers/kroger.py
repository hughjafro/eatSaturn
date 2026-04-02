"""Kroger weekly ad scraper."""
from __future__ import annotations

import logging
from typing import Any

from playwright.sync_api import Page
from bs4 import BeautifulSoup

from ..base_scraper import BaseScraper

logger = logging.getLogger(__name__)


class KrogerScraper(BaseScraper):
    chain_key = "kroger"

    def parse_sale_items(self, page: Page) -> list[dict[str, Any]]:
        """Parse Kroger's weekly ad. Kroger renders a JS-heavy SPA."""
        items: list[dict[str, Any]] = []

        html = page.content()
        soup = BeautifulSoup(html, "html.parser")

        # Kroger weekly ad uses kds-Price components
        for card in soup.select(".kds-Price, [data-qa='price-card'], .item-card"):
            product_name = (
                self._text(card, ".kds-Price-promotional, .item-title, [data-qa='item-title']")
                or self._text(card, "h3, h4, .name")
            )
            if not product_name:
                continue

            sale_price_raw = (
                self._text(card, ".kds-Price-promotional-price, .sale-price, [data-qa='price']")
            )
            regular_price_raw = self._text(card, ".kds-Price-regular, .reg-price")
            category_raw = self._text(card, ".kds-Price-category, .category")
            image_url = self._attr(card, "img", "src")

            items.append({
                "product_name": product_name,
                "sale_price_raw": sale_price_raw or "",
                "regular_price_raw": regular_price_raw or "",
                "category_raw": category_raw,
                "image_url": image_url,
                "raw_description": card.get_text(separator=" ", strip=True)[:500],
            })

        logger.debug("Kroger: found %d raw items", len(items))
        return items

    @staticmethod
    def _text(parent: Any, selector: str) -> str | None:
        el = parent.select_one(selector)
        return el.get_text(strip=True) if el else None

    @staticmethod
    def _attr(parent: Any, selector: str, attr: str) -> str | None:
        el = parent.select_one(selector)
        return el.get(attr) if el else None
