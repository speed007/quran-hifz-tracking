import logging
from datetime import datetime, time
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class AppScheduler:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone=settings.tz)
        self._handlers: list[Callable[[datetime], None]] = []

    def on_minute(self, handler: Callable[[datetime], None]) -> None:
        self._handlers.append(handler)

    def start(self) -> None:
        self._scheduler.add_job(
            self._tick,
            CronTrigger(minute="*", timezone=settings.tz),
            id="minute_tick",
            max_instances=1,
            coalesce=True,
        )
        self._scheduler.start()
        logger.info("Scheduler started (timezone=%s)", settings.tz)

    def _tick(self) -> None:
        now = datetime.now(settings.tz).replace(tzinfo=None)
        for handler in self._handlers:
            try:
                handler(now)
            except Exception:
                logger.exception("Scheduled handler failed")
        self._last_tick = now

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)


scheduler = AppScheduler()
