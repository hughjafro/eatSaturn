"""
APScheduler cron to run all scrapers every Sunday at 11 PM.
"""
import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from .runner import run_all_scrapers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def scheduled_scrape() -> None:
    logger.info("Scheduled scrape started")
    results = run_all_scrapers()
    logger.info("Scheduled scrape complete: %s", results)


if __name__ == "__main__":
    scheduler = BlockingScheduler(timezone="America/New_York")
    # Run every Sunday at 23:00 ET
    scheduler.add_job(scheduled_scrape, CronTrigger(day_of_week="sun", hour=23, minute=0))
    logger.info("Scheduler started — next run: Sunday 23:00 ET")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped")
