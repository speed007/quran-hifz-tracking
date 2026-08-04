from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..quran_meta import (
    JUZ,
    TOTAL_AYAHS,
    page_of_ayah,
    page_range_meta,
    ruku_range,
)


def _juz_page_ranges() -> dict[int, tuple[int, int]]:
    """First and last mushaf page of each juz (1..30)."""
    return {
        j: (
            page_of_ayah(JUZ[j]),
            page_of_ayah(JUZ[j + 1] - 1 if j < 30 else TOTAL_AYAHS),
        )
        for j in range(1, 31)
    }


def covered_ayah_range(
    row: models.Session,
) -> tuple[int | None, int | None]:
    """The (from, to) ayah range actually completed, 1-based within the juz.

    For a partial session this is the reported partial range; otherwise it is
    the full assigned range. Sessions without juz/ayah data return (None, None).
    """
    if row.juz is None:
        return None, None
    if (
        row.completion == "partial"
        and row.partial_from_ayah is not None
        and row.partial_to_ayah is not None
    ):
        return row.partial_from_ayah, row.partial_to_ayah
    if row.from_ayah is not None and row.to_ayah is not None:
        return row.from_ayah, row.to_ayah
    return None, None


def covered_global_ayahs(row: models.Session) -> tuple[int, int] | None:
    """Global mushaf ayah ids (start, end) actually completed, or None."""
    if row.juz is None:
        return None
    af, at = covered_ayah_range(row)
    if af is None:
        return None
    first = JUZ[row.juz]
    return first + af - 1, first + at - 1


def covered_page_range(row: models.Session) -> tuple[int, int]:
    """The (from_page, to_page) actually completed."""
    if row.juz is not None:
        g = covered_global_ayahs(row)
        if g is not None:
            return page_of_ayah(g[0]), page_of_ayah(g[1])
    return row.from_page, row.to_page


def covered_ruku_range(row: models.Session) -> tuple[int, int]:
    """The (ruku_from, ruku_to) actually completed."""
    g = covered_global_ayahs(row)
    if g is not None:
        return ruku_range(g[0], g[1])
    p_from, p_to = covered_page_range(row)
    _jf, _jt, rk_f, rk_t = page_range_meta(p_from, p_to)
    return rk_f, rk_t


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
            c_from, c_to = covered_page_range(row)
            covered.update(
                range(max(c_from, p_from), min(c_to, p_to) + 1)
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
        c_from, c_to = covered_page_range(row)
        pages.update(range(c_from, c_to + 1))
        rk_from, rk_to = covered_ruku_range(row)
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
