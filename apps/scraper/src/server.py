"""
Lightweight FastAPI server exposing a manual scrape trigger endpoint.
Protected by SCRAPER_SECRET header.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from dotenv import load_dotenv

from .runner import run_all_scrapers

load_dotenv()
logger = logging.getLogger(__name__)

app = FastAPI(title="CartSpoon Scraper", docs_url=None, redoc_url=None)

SCRAPER_SECRET = os.environ.get("SCRAPER_SECRET", "")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scrape/trigger")
def trigger_scrape(x_scraper_secret: str = Header(default="")) -> dict[str, Any]:
    """Manually trigger all store scrapers. Requires X-Scraper-Secret header."""
    if not SCRAPER_SECRET or x_scraper_secret != SCRAPER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    logger.info("Manual scrape trigger received")
    results = run_all_scrapers()
    return {"status": "complete", "results": results}
