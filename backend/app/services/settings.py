from datetime import date

from sqlalchemy.orm import Session

from .. import models, schemas

KEYS = {
    "telegram_daily_time": "18:00",
    "alexa_enabled": "true",
    "alexa_weekday_time": "16:00",
    "alexa_weekend_time": "11:00",
    "revision_lookback_pages": "3",
    "season_start": "",
}


def get_settings_dict(db: Session) -> schemas.SettingsOut:
    stored = {row.key: row.value for row in db.query(models.Setting).all()}
    merged = {**KEYS, **stored}
    return schemas.SettingsOut(
        telegram_daily_time=merged["telegram_daily_time"],
        alexa_enabled=merged["alexa_enabled"] == "true",
        alexa_weekday_time=merged["alexa_weekday_time"],
        alexa_weekend_time=merged["alexa_weekend_time"],
        revision_lookback_pages=int(merged["revision_lookback_pages"]),
        season_start=_parse_date(merged["season_start"]),
    )


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def update_setting(db: Session, field: str, value) -> None:
    if field not in KEYS:
        raise ValueError(f"Unknown setting: {field}")
    if isinstance(value, bool):
        str_value = "true" if value else "false"
    else:
        str_value = str(value)
    row = db.get(models.Setting, field)
    if row is None:
        db.add(models.Setting(key=field, value=str_value))
    else:
        row.value = str_value
    db.commit()
