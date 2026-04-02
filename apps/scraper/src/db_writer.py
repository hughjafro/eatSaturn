"""
Write scraped sale items to Supabase / PostgreSQL.
Uses upsert for idempotency — re-running the scraper never creates duplicates.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from .models import SaleItem

load_dotenv()
logger = logging.getLogger(__name__)

UPSERT_SQL = """
INSERT INTO sale_items
  (store_id, week_of, product_name, normalized_name, category, unit,
   sale_price, regular_price, raw_description, image_url)
VALUES %s
ON CONFLICT (store_id, week_of, normalized_name)
DO UPDATE SET
  product_name    = EXCLUDED.product_name,
  category        = EXCLUDED.category,
  unit            = EXCLUDED.unit,
  sale_price      = EXCLUDED.sale_price,
  regular_price   = EXCLUDED.regular_price,
  raw_description = EXCLUDED.raw_description,
  image_url       = EXCLUDED.image_url;
"""


def _get_connection() -> psycopg2.extensions.connection:
    dsn = os.environ["DATABASE_URL"]
    return psycopg2.connect(dsn)


def write_sale_items(items: list[SaleItem]) -> int:
    """Upsert items into the database. Returns the count written."""
    if not items:
        return 0

    rows: list[tuple[Any, ...]] = [
        (
            str(item.store_id),
            item.week_of,
            item.product_name,
            item.normalized_name,
            item.category,
            item.unit,
            item.sale_price,
            item.regular_price,
            item.raw_description,
            item.image_url,
        )
        for item in items
    ]

    conn = _get_connection()
    try:
        with conn, conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, UPSERT_SQL, rows)
            row_count = cur.rowcount
    finally:
        conn.close()

    logger.info("Upserted %d sale items", row_count)
    return row_count


def count_sale_items(store_id: str, week_of: Any) -> int:
    """Return the count of sale items for a given store and week."""
    conn = _get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM sale_items WHERE store_id = %s AND week_of = %s",
                (store_id, week_of),
            )
            return cur.fetchone()[0]
    finally:
        conn.close()
