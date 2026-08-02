from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas


def compute_progress(db: Session, student_id: int) -> schemas.ProgressOut:
    """Memorised pages are the union of pages covered by 'new' sessions."""
    new_rows = (
        db.query(models.Session)
        .filter(
            models.Session.student_id == student_id,
            models.Session.kind == "new",
        )
        .all()
    )
    pages: set[int] = set()
    for row in new_rows:
        pages.update(range(row.from_page, row.to_page + 1))

    total = schemas.ProgressOut(
        total_pages=604,
        memorised_pages=len(pages),
        percent=round(len(pages) / 604 * 100, 1) if pages else 0.0,
    )

    latest = (
        db.query(models.Session)
        .filter(
            models.Session.student_id == student_id,
            models.Session.kind == "new",
        )
        .order_by(models.Session.id.desc())
        .first()
    )
    if latest is not None:
        surah = db.get(models.Surah, latest.surah_id)
        if surah is not None:
            total.current_surah = surah
            total.current_page = latest.to_page
    return total


def revision_range(db: Session, student_id: int, lookback_pages: int = 3):
    """The pages to revise: today's latest revision session if any, else the last
    `lookback_pages` memorised pages."""
    today_latest = (
        db.query(models.Session)
        .filter(
            models.Session.student_id == student_id,
            models.Session.kind == "revision",
        )
        .order_by(models.Session.date.desc(), models.Session.id.desc())
        .first()
    )
    if today_latest is not None:
        return today_latest.from_page, today_latest.to_page

    latest_new = (
        db.query(models.Session)
        .filter(
            models.Session.student_id == student_id,
            models.Session.kind == "new",
        )
        .order_by(models.Session.id.desc())
        .first()
    )
    if latest_new is None:
        return None
    end = latest_new.to_page
    start = max(1, end - lookback_pages + 1)
    return start, end
