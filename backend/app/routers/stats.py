from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..routers.sessions import _enrich
from ..services.progress import (
    compute_juz_summary,
    compute_progress,
    covered_ayah_range,
    covered_page_range,
)

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=schemas.StatsOut)
def stats(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    if user.role == "user" and user.student_id is not None:
        student = db.get(models.Student, user.student_id)
        students = [student] if student else []
    else:
        students = db.query(models.Student).order_by(models.Student.name).all()

    progress = {
        s.id: compute_progress(db, s.id) for s in students
    }
    juz_summary = {
        s.id: compute_juz_summary(db, s.id) for s in students
    }

    q = db.query(models.Session)
    if user.role == "user":
        q = q.filter(models.Session.student_id == user.student_id)
    recent = q.order_by(models.Session.date.desc(), models.Session.id.desc()).limit(15).all()
    enriched = _enrich(db, recent)

    rateable = []
    if user.role != "user":
        rateable_rows = (
            db.query(models.Session)
            .filter(models.Session.completed.is_(True), models.Session.rating.is_(None))
            .order_by(
                models.Session.completed_at.desc().nullslast(),
                models.Session.date.desc(),
                models.Session.id.desc(),
            )
            .limit(50)
            .all()
        )
        rateable = _enrich(db, rateable_rows)

    rated = []
    if user.role == "user":
        rated_rows = (
            db.query(models.Session)
            .filter(
                models.Session.student_id == user.student_id,
                models.Session.rating.is_not(None),
            )
            .order_by(
                models.Session.completed_at.desc().nullslast(),
                models.Session.date.desc(),
                models.Session.id.desc(),
            )
            .limit(15)
            .all()
        )
        rated = _enrich(db, rated_rows)

    today = date.today()
    today_q = db.query(func.count(models.Session.id)).filter(
        models.Session.date == today
    )
    total_q = db.query(func.count(models.Session.id))
    if user.role == "user":
        today_q = today_q.filter(models.Session.student_id == user.student_id)
        total_q = total_q.filter(models.Session.student_id == user.student_id)
    today_activity = today_q.scalar() or 0
    total_sessions = total_q.scalar() or 0

    return schemas.StatsOut(
        students=students,
        progress=progress,
        recent_sessions=enriched,
        today_activity=today_activity,
        total_sessions=total_sessions,
        juz_summary=juz_summary,
        rateable_sessions=rateable,
        rated_sessions=rated,
    )


@router.get("/history", response_model=schemas.HistoryOut)
def history(
    student_id: int | None = Query(default=None),
    kind: schemas.SessionKind | None = None,
    from_month: str | None = None,
    to_month: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Per-student historical analytics from the start of the season.

    Sessions count toward the month in which they were completed
    (`completed_at`). The season starts at the student's first session; there
    is no separate season setting. `kind`, `from_month` and `to_month` narrow
    the view, and `sessions` lists the matching individual sessions for
    drill-down.
    """
    if user.role == "user":
        if user.student_id is None:
            raise HTTPException(status_code=403, detail="No linked student")
        student_id = user.student_id
    if student_id is None:
        raise HTTPException(status_code=400, detail="student_id is required")
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    for month in (from_month, to_month):
        if month is not None and not _is_month(month):
            raise HTTPException(status_code=400, detail="months must be YYYY-MM")

    earliest = (
        db.query(func.min(models.Session.date))
        .filter(models.Session.student_id == student_id)
        .scalar()
    )
    season_start = earliest

    completed_from = None
    if season_start is not None:
        completed_from = datetime.combine(season_start, time.min)
    completed_to = None
    if from_month is not None:
        start, _end = _month_bounds(from_month)
        completed_from = max(completed_from, start) if completed_from else start
    if to_month is not None:
        _start, end = _month_bounds(to_month)
        completed_to = end

    all_q = db.query(models.Session).filter(
        models.Session.student_id == student_id
    )
    if season_start is not None:
        all_q = all_q.filter(models.Session.date >= season_start)
    if kind is not None:
        all_q = all_q.filter(models.Session.kind == kind)
    if completed_from is not None:
        all_q = all_q.filter(models.Session.date >= completed_from.date())
    if completed_to is not None:
        all_q = all_q.filter(models.Session.date < completed_to.date())
    total_sessions = all_q.count()

    completed_q = db.query(models.Session).filter(
        models.Session.student_id == student_id,
        models.Session.completed == True,  # noqa: E712
    )
    if kind is not None:
        completed_q = completed_q.filter(models.Session.kind == kind)
    if completed_from is not None:
        completed_q = completed_q.filter(models.Session.completed_at >= completed_from)
    if completed_to is not None:
        completed_q = completed_q.filter(models.Session.completed_at < completed_to)
    completed = completed_q.all()

    months: dict[str, dict] = {}
    stars: dict[str, dict] = {}
    for row in completed:
        c_from, c_to = covered_page_range(row)
        pages = c_to - c_from + 1
        af, at = covered_ayah_range(row)
        ayahs = at - af + 1 if af is not None else 0
        if row.completed_at is not None:
            key = row.completed_at.strftime("%Y-%m")
            m = months.setdefault(
                key,
                {"sessions": 0, "pages": 0, "ayahs": 0, "rated": 0, "stars": 0},
            )
            m["sessions"] += 1
            m["pages"] += pages
            m["ayahs"] += ayahs
            if row.rating is not None:
                m["rated"] += 1
                m["stars"] += row.rating
        skey = str(row.rating) if row.rating is not None else "unrated"
        s = stars.setdefault(skey, {"rating": row.rating, "sessions": 0, "pages": 0, "ayahs": 0})
        s["sessions"] += 1
        s["pages"] += pages
        s["ayahs"] += ayahs

    by_month = []
    for key in sorted(months):
        m = months[key]
        by_month.append(
            schemas.HistoryMonthOut(
                month=key,
                sessions=m["sessions"],
                pages=m["pages"],
                ayahs=m["ayahs"],
                stars=m["stars"],
                avg_rating=(
                    round(m["stars"] / m["rated"], 1) if m["rated"] else None
                ),
            )
        )

    by_stars = [
        schemas.HistoryStarsOut(
            rating=stars[k]["rating"],
            sessions=stars[k]["sessions"],
            pages=stars[k]["pages"],
            ayahs=stars[k]["ayahs"],
        )
        for k in sorted(
            stars, key=lambda k: (stars[k]["rating"] is None, - (stars[k]["rating"] or 0))
        )
    ]

    rated_sessions = sum(1 for r in completed if r.rating is not None)
    total_stars = sum(r.rating or 0 for r in completed)
    juz_rows = compute_juz_summary(
        db,
        student_id,
        kind=kind,
        completed_from=completed_from,
        completed_to=completed_to,
    )
    by_juz = [
        schemas.HistoryJuzOut(
            juz=j.juz,
            pages_memorised=j.pages_memorised,
            total_pages=j.total_pages,
            percent=(
                round(j.pages_memorised / j.total_pages * 100, 1)
                if j.total_pages
                else 0.0
            ),
            complete=j.complete,
            sessions=j.sessions,
            rated_sessions=j.rated_sessions,
            avg_rating=j.avg_rating,
            duration_days=j.duration_days,
        )
        for j in juz_rows
    ]

    completion_dates = [
        r.completed_at.date()
        for r in completed
        if r.completed_at is not None
    ] or [
        r.date for r in completed
    ]

    return schemas.HistoryOut(
        summary=schemas.HistorySummaryOut(
            student_id=student.id,
            student_name=student.name,
            season_start=season_start,
            first_session=min(completion_dates) if completion_dates else None,
            last_session=max(completion_dates) if completion_dates else None,
            total_sessions=total_sessions,
            completed_sessions=len(completed),
            rated_sessions=rated_sessions,
            total_stars=total_stars,
            avg_rating=(
                round(total_stars / rated_sessions, 1) if rated_sessions else None
            ),
            pages_memorised=sum(
                (
                    p_to - p_from + 1
                    for p_from, p_to in (
                        covered_page_range(r) for r in completed
                    )
                ),
                start=0,
            ),
            ayahs_memorised=sum(
                (at - af + 1)
                for r in completed
                for af, at in (covered_ayah_range(r),)
                if af is not None
            ),
            juzs_completed=sum(1 for j in by_juz if j.complete),
        ),
        by_month=by_month,
        by_juz=by_juz,
        by_stars=by_stars,
        sessions=_enrich(db, completed),
    )


def _is_month(value: str) -> bool:
    try:
        datetime.strptime(value, "%Y-%m")
        return True
    except ValueError:
        return False


def _month_bounds(month: str) -> tuple[datetime, datetime]:
    """Return (start, end-exclusive) datetimes for a YYYY-MM month."""
    year, mon = int(month[:4]), int(month[5:7])
    start = datetime(year, mon, 1)
    end = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)
    return start, end
