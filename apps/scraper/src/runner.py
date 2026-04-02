"""
Scraper runner: fetch all stores from DB, instantiate the right scraper,
run it, write results, and verify health.
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from uuid import UUID

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from .alerting import send_alert
from .base_scraper import current_week_monday
from .db_writer import write_sale_items, count_sale_items
from .scrapers.kroger import KrogerScraper
from .scrapers.safeway import SafewayScraper
from .scrapers.aldi import AldiScraper

load_dotenv()
logger = logging.getLogger(__name__)

SCRAPER_MAP = {
    "kroger": KrogerScraper,
    "safeway": SafewayScraper,
    "aldi": AldiScraper,
}

HEALTH_MIN_ITEMS = 20  # Alert if fewer than this many items scraped per store


def get_active_stores() -> list[dict]:
    """Fetch active stores from the database."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, chain_key, scrape_url, scrape_config "
                "FROM stores WHERE is_active = true"
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def run_all_scrapers() -> dict[str, int]:
    """
    Run all active store scrapers.
    Returns a dict of chain_key → items written.
    Continues on individual scraper failure; sends alerts on error or low item count.
    """
    week_of = current_week_monday()
    results: dict[str, int] = {}

    try:
        stores = get_active_stores()
    except Exception as exc:
        send_alert(f"CRITICAL: Cannot connect to database — {exc}")
        raise

    for store in stores:
        chain_key = store["chain_key"]
        scraper_cls = SCRAPER_MAP.get(chain_key)

        if scraper_cls is None:
            logger.warning("No scraper registered for chain_key '%s'", chain_key)
            continue

        try:
            scraper = scraper_cls(
                store_id=UUID(str(store["id"])),
                scrape_url=store["scrape_url"],
                scrape_config=store["scrape_config"] or {},
            )
            items = scraper.scrape()
            count = write_sale_items(items)
            results[chain_key] = count

            # Health check
            actual_count = count_sale_items(str(store["id"]), week_of)
            if actual_count < HEALTH_MIN_ITEMS:
                send_alert(
                    f"WARNING: {store['name']} scraped only {actual_count} items "
                    f"for week {week_of} (minimum expected: {HEALTH_MIN_ITEMS})"
                )
        except Exception as exc:
            logger.error("Scraper failed for %s: %s", chain_key, exc, exc_info=True)
            send_alert(f"ERROR: Scraper failed for {store['name']} (week {week_of}): {exc}")
            results[chain_key] = 0

    return results
