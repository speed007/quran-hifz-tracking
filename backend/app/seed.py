from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .security import hash_password
from .surahs_data import build_surah_list

settings = get_settings()


def seed_database(db: Session) -> None:
    if db.scalar(select(models.Surah).limit(1)) is None:
        db.add_all(
            models.Surah(
                number=number,
                name_ar=name_ar,
                name_en=name_en,
                start_page=start_page,
                end_page=end_page,
            )
            for number, name_ar, name_en, start_page, end_page in build_surah_list()
        )

    if db.scalar(select(models.User).limit(1)) is None:
        db.add(
            models.User(
                name=settings.default_admin_name,
                username=settings.default_admin_username,
                password_hash=hash_password(settings.default_admin_password),
                role="creator",
            )
        )
    elif db.scalar(select(models.User).filter(models.User.role == "creator").limit(1)) is None:
        first = db.scalar(
            select(models.User).filter(models.User.role == "admin").order_by(models.User.id).limit(1)
        )
        if first is not None:
            first.role = "creator"

    defaults = {
        "telegram_daily_time": settings.telegram_daily_time,
        "alexa_enabled": "true" if settings.alexa_enabled else "false",
        "alexa_weekday_time": settings.alexa_weekday_time,
        "alexa_weekend_time": settings.alexa_weekend_time,
        "revision_lookback_pages": str(settings.revision_lookback_pages),
    }
    for key, value in defaults.items():
        if db.get(models.Setting, key) is None:
            db.add(models.Setting(key=key, value=value))

    db.commit()
