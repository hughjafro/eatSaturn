"""Send alert notifications via webhook (Slack/Discord compatible)."""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

ALERT_WEBHOOK_URL = os.getenv("ALERT_WEBHOOK_URL", "")


def send_alert(message: str) -> None:
    """POST a message to the configured webhook URL. Fails silently."""
    if not ALERT_WEBHOOK_URL:
        logger.warning("ALERT_WEBHOOK_URL not set — cannot send alert: %s", message)
        return
    try:
        httpx.post(ALERT_WEBHOOK_URL, json={"text": message}, timeout=10)
        logger.info("Alert sent: %s", message)
    except Exception as exc:
        logger.error("Failed to send alert: %s — %s", message, exc)
