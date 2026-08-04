from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..quran_meta import TOTAL_AYAHS, JUZ, page_of_ayah, page_range_meta


def _juz_page_ranges() -> dict[int, tuple[int, int]]:
    """First and last mushaf page of each juz (1..30)."""
    return {
        j: (
            page_of_ayah(JUZ[j]),
            page_of_ayah(JUZ[j + 1] - 1 if j < 30 else TOTAL_AYAHS),
        )
        for j in range(1, 31)
    }


def compute_juz_summary(
    db: Session,
    student_id: int,
    *,
    kind: str | None = None,
    completed_from: datetime | None = None,
    completed_to: datetime | None = None,
) -> list[schemas.JuzSummaryOut]:
    """Per-juz stats from completed sessions: average stars, days taken, pages.

    A session is attributed to the juz it starts in (for ratings, duration and
    session count), but its pages count toward every juz it covers.

    `kind` restricts to a session type; `completed_from`/`completed_to`
    restrict to completion times (season / drill-down filters).
    """
    q = db.query(models.Session).filter(
        models.Session.student_id == student_id,
        models.Session.completed == True,  # noqa: E712
    )
    if kind is not None:
        q = q.filter(models.Session.kind == kind)
    if completed_from is not None:
        q = q.filter(models.Session.completed_at >= completed_from)
    if completed_to is not None:
        q = q.filter(models.Session.completed_at < completed_to)
    rows = q.all()
    juz_pages = _juz_page_ranges()
    pages_by_juz: dict[int, set[int]] = {}
    sessions_by_juz: dict[int, int] = {}
    ratings_by_juz: dict[int, list[int]] = {}
    dates_by_juz: dict[int, list] = {}
    completed_at_by_juz: dict[int, list] = {}

    for row in rows:
        if row.juz is not None:
            jz_from = jz_to = row.juz
        else:
            jz_from, jz_to, _rk_from, _rk_to = page_range_meta(
                row.from_page, row.to_page
            )
        for juz in range(jz_from, jz_to + 1):
            p_from, p_to = juz_pages[juz]
            covered = pages_by_juz.setdefault(juz, set())
            covered.update(
                range(max(row.from_page, p_from), min(row.to_page, p_to) + 1)
            )
        sessions_by_juz[jz_from] = sessions_by_juz.get(jz_from, 0) + 1
        if row.rating is not None:
            ratings_by_juz.setdefault(jz_from, []).append(row.rating)
        dates_by_juz.setdefault(jz_from, []).append(row.date)
        if row.completed_at is not None:
            completed_at_by_juz.setdefault(jz_from, []).append(row.completed_at)

    out: list[schemas.JuzSummaryOut] = []
    for juz in sorted(sessions_by_juz):
        p_from, p_to = juz_pages[juz]
        total_pages = p_to - p_from + 1
        pages = len(pages_by_juz.get(juz, set()))
        ratings = ratings_by_juz.get(juz, [])
        dates = dates_by_juz.get(juz, [])
        completed_at = completed_at_by_juz.get(juz, [])
        duration_days = None
        if dates and completed_at:
            first = min(dates)
            last = max(completed_at).date()
            duration_days = (last - first).days
        out.append(
            schemas.JuzSummaryOut(
                juz=juz,
                page_from=p_from,
                page_to=p_to,
                pages_memorised=pages,
                total_pages=total_pages,
                complete=pages >= total_pages,
                sessions=sessions_by_juz[juz],
                rated_sessions=len(ratings),
                avg_rating=(
                    round(sum(ratings) / len(ratings), 1) if ratings else None
                ),
                duration_days=duration_days,
            )
        )
    return out


def compute_progress(db: Session, student_id: int) -> schemas.ProgressOut:
    """Memorised pages are the union of pages covered by completed 'new' sessions."""
    new_rows = (
        db.query(models.Session)
        .filter(
            models.Session.student_id == student_id,
            models.Session.kind == "new",
            models.Session.completed == True,  # noqa: E712
        )
        .all()
    )
    pages: set[int] = set()
    rukus: set[int] = set()
    for row in new_rows:
        pages.update(range(row.from_page, row.to_page + 1))
        jz_from, jz_to, rk_from, rk_to = page_range_meta(
            row.from_page, row.to_page
        )
        rukus.update(range(rk_from, rk_to + 1))

    total = schemas.ProgressOut(
        total_pages=604,
        memorised_pages=len(pages),
        percent=round(len(pages) / 604 * 100, 1) if pages else 0.0,
        rukus_memorised=len(rukus),
    )

    latest = (
        db.query(models.Session)
        .filter(
            models.Session.student_id == student_id,
            models.Session.kind == "new",
            models.Session.completed == True,  # noqa: E712
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
