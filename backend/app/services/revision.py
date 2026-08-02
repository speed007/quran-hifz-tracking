import logging
from datetime import datetime

from sqlalchemy.orm import Session

from .. import models
from .progress import revision_range
from .settings import get_settings_dict

logger = logging.getLogger(__name__)

_QUANTITY_MAP = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
}


def build_revision_message(db: Session, student: models.Student, settings: object) -> str | None:
    """Return the UK-English Alexa announcement for a student, or None if there is
    nothing to revise yet."""
    pages = revision_range(db, student.id, settings.revision_lookback_pages)
    if pages is None:
        return None

    first, last = pages
    student_name = student.name
    if first == last:
        body = f"Please revise page {first}."
    else:
        body = f"Please revise pages {first} to {last}."
    return f"{student_name}, it's time for revision. {body}"


def schedule_for_today(db: Session) -> list[tuple[models.Student, str, str]]:
    """Return [(student, topic_slug, message)] to fire today based on settings."""
    from ..services.mqtt import publisher

    settings_obj = get_settings_dict(db)
    if not settings_obj.alexa_enabled:
        return []

    now = datetime.now()
    is_weekend = now.weekday() >= 5
    target = settings_obj.alexa_weekend_time if is_weekend else settings_obj.alexa_weekday_time
    current = now.strftime("%H:%M")
    if current != target:
        return []

    students = db.query(models.Student).all()
    result = []
    for student in students:
        message = build_revision_message(db, student, settings_obj)
        if message is None:
            continue
        slug = _slugify(student.name)
        result.append((student, slug, message))
    return result


def _slugify(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum() or ch in "_-") or "student"
