import logging
from datetime import datetime, time, timedelta

from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from .settings import get_settings_dict

logger = logging.getLogger(__name__)

settings = get_settings()


def slugify(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum() or ch in "_-") or "student"


def fmt_time(hhmm: str) -> str:
    """Format "17:00" as "5:00pm" for a UK-English announcement."""
    hour, minute = (int(part) for part in hhmm.split(":"))
    period = "am" if hour < 12 else "pm"
    display = hour % 12
    if display == 0:
        display = 12
    return f"{display}:{minute:02d}{period}"


def _parse_time(hhmm: str) -> time:
    hour, minute = (int(part) for part in hhmm.split(":"))
    return time(hour, minute)


def build_schedule_state(entries: list[models.ScheduleEntry]) -> list[dict]:
    """Compact JSON snapshot of a student's slots, pushed to Home Assistant."""
    state = []
    for entry in entries:
        state.append(
            {
                "label": entry.label,
                "day_of_week": entry.day_of_week,
                "date": entry.date.isoformat() if entry.date else None,
                "start_time": entry.start_time,
                "end_time": entry.end_time,
            }
        )
    return state


def schedule_reminders_for_now(db: Session) -> list[tuple[str, str]]:
    """Return [(student_slug, message)] for schedule slots whose reminder time
    (start time minus that student's lead minutes) matches the current minute."""
    settings_obj = get_settings_dict(db)
    if not settings_obj.alexa_enabled:
        return []

    now = datetime.now(settings.tz).replace(tzinfo=None)
    students = (
        db.query(models.Student)
        .filter(models.Student.alexa_schedule_enabled.is_(True))
        .all()
    )
    result = []
    for student in students:
        entries = (
            db.query(models.ScheduleEntry)
            .filter(models.ScheduleEntry.student_id == student.id)
            .all()
        )
        for entry in entries:
            if entry.day_of_week is not None:
                if entry.day_of_week != now.weekday():
                    continue
            else:
                if entry.date != now.date():
                    continue
            start = datetime.combine(now.date(), _parse_time(entry.start_time))
            target = start - timedelta(minutes=student.alexa_schedule_lead_minutes or 0)
            if target.date() != now.date():
                continue  # lead time crosses midnight; skip
            if now.strftime("%H:%M") != target.strftime("%H:%M"):
                continue
            label = (entry.label or "Study").strip()
            message = (
                f"{student.name}, {label} starts at {fmt_time(entry.start_time)}."
            )
            result.append((slugify(student.name), message))
    return result
