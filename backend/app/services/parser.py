import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from .. import models

KIND_WORDS = {
    "new": "new",
    "memorised": "new",
    "memorized": "new",
    "memorise": "new",
    "memorize": "new",
    "n": "new",
    "revision": "revision",
    "revise": "revision",
    "review": "revision",
    "r": "revision",
}

_PAGE_NUM = r"\d{1,3}"


@dataclass
class ParsedSession:
    student: models.Student
    kind: str
    surah: models.Surah
    from_page: int
    to_page: int


@dataclass
class ParsedMessage:
    kind: str
    data: str | None = None
    error: str | None = None


class ParseError(Exception):
    pass


def _resolve_surah(db: Session, token: str | None) -> models.Surah | None:
    if token is None:
        return None
    token = token.strip()
    if token.isdigit():
        return db.query(models.Surah).filter(models.Surah.number == int(token)).first()
    return (
        db.query(models.Surah)
        .filter(
            (models.Surah.name_en.ilike(f"%{token}%"))
            | (models.Surah.name_ar == token)
        )
        .first()
    )


def _resolve_student(db: Session, text: str) -> tuple[models.Student | None, str]:
    """Return (student, remainder) or (None, text)."""
    students = db.query(models.Student).all()
    for student in students:
        lowered = text.lower()
        name = student.name.lower()
        if lowered.startswith(name):
            return student, text[len(name) :].strip()
        # match student name as a word boundary prefix
        match = re.match(re.escape(name) + r"[\s,]+", lowered)
        if match:
            return student, text[match.end() :]
    return None, text


def parse_session_message(db: Session, text: str) -> ParsedSession:
    """Parse e.g. 'Ahmed new 15 to 18', 'Ahmed revision Yaseen 35 to 37'."""
    student, remainder = _resolve_student(db, text.strip())
    if student is None:
        raise ParseError(
            "I couldn't find a student name. Registered students: "
            + ", ".join(s.name for s in db.query(models.Student).all())
            or "none yet"
        )

    tokens = remainder.split()
    if not tokens:
        raise ParseError("Please include a type (new or revision) and page range.")

    kind_word = tokens[0].lower()
    if kind_word not in KIND_WORDS:
        raise ParseError(
            f"'{tokens[0]}' is not a recognised type. Use 'new' or 'revision'."
        )
    kind = KIND_WORDS[kind_word]
    tokens = tokens[1:]

    # Strip connectors like 'from', 'to', 'page', 'pages'
    tokens = [t for t in tokens if t.lower() not in ("from", "to", "page", "pages", "p")]

    numbers = [t for t in tokens if t.isdigit()]
    surah_token = None
    for t in tokens:
        if not t.isdigit():
            surah_token = t
            break

    if not numbers:
        raise ParseError("Please include page numbers, e.g. 'Ahmed new 15 to 18'.")

    from_page = int(numbers[0])
    to_page = int(numbers[-1]) if len(numbers) > 1 else from_page
    if from_page > to_page:
        from_page, to_page = to_page, from_page

    surah = _resolve_surah(db, surah_token)
    if surah is not None and (from_page < surah.start_page or to_page > surah.end_page):
        raise ParseError(
            f"Pages {from_page}-{to_page} don't fall within {surah.name_en} "
            f"(pages {surah.start_page}-{surah.end_page})."
        )
    if surah is None:
        surah = db.query(models.Surah).filter(
            models.Surah.start_page <= from_page, models.Surah.end_page >= to_page
        ).first()
    if surah is None:
        raise ParseError(f"Couldn't find a surah containing pages {from_page}-{to_page}.")

    return ParsedSession(
        student=student, kind=kind, surah=surah, from_page=from_page, to_page=to_page
    )


def parse_settings_message(text: str) -> ParsedMessage:
    """Parse e.g. 'reminder 16:00' or 'weekend 11:00' or 'daily 18:00'."""
    text = text.strip()
    lowered = text.lower()
    time_match = re.search(r"(\d{1,2}):(\d{2})", text)
    if time_match is None:
        return ParsedMessage(kind="help", error="Please give a time like 'reminder 16:00'.")
    time_str = f"{int(time_match.group(1)):02d}:{time_match.group(2)}"
    if "weekend" in lowered:
        return ParsedMessage(kind="weekend", data=time_str)
    if "daily" in lowered or "telegram" in lowered:
        return ParsedMessage(kind="daily", data=time_str)
    if "weekday" in lowered or "reminder" in lowered or "alexa" in lowered:
        return ParsedMessage(kind="weekday", data=time_str)
    return ParsedMessage(kind="weekday", data=time_str)
