from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..routers.sessions import _enrich
from ..services.progress import compute_juz_summary, compute_progress
from ..services.settings import get_settings_dict

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
    today_activity = (
        db.query(func.count(models.Session.id))
        .filter(models.Session.date == today)
        .scalar()
        or 0
    )
    total_sessions = db.query(func.count(models.Session.id)).scalar() or 0

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
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Per-student historical analytics from the start of the season.

    Sessions count toward the month in which they were completed
    (`completed_at`). The season starts at the `season_start` setting, or at
    the student's first session if the setting is unset.
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

    setting_start = get_settings_dict(db).season_start
    earliest = (
        db.query(func.min(models.Session.date))
        .filter(models.Session.student_id == student_id)
        .scalar()
    )
    season_start = setting_start or earliest

    all_q = db.query(models.Session).filter(
        models.Session.student_id == student_id
    )
    if season_start is not None:
        all_q = all_q.filter(models.Session.date >= season_start)
    total_sessions = all_q.count()

    completed_q = db.query(models.Session).filter(
        models.Session.student_id == student_id,
        models.Session.completed == True,  # noqa: E712
    )
    if season_start is not None:
        completed_q = completed_q.filter(
            models.Session.completed_at >= datetime.combine(season_start, time.min)
        )
    completed = completed_q.all()

    months: dict[str, dict] = {}
    for row in completed:
        if row.completed_at is None:
            continue
        key = row.completed_at.strftime("%Y-%m")
        m = months.setdefault(
            key,
            {"sessions": 0, "pages": 0, "ayahs": 0, "rated": 0, "stars": 0},
        )
        m["sessions"] += 1
        m["pages"] += row.to_page - row.from_page + 1
        if row.from_ayah is not None and row.to_ayah is not None:
            m["ayahs"] += row.to_ayah - row.from_ayah + 1
        if row.rating is not None:
            m["rated"] += 1
            m["stars"] += row.rating

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

    rated_sessions = sum(1 for r in completed if r.rating is not None)
    total_stars = sum(r.rating or 0 for r in completed)
    juz_rows = compute_juz_summary(db, student_id, since=season_start)
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
            pages_memorised=sum(r.to_page - r.from_page + 1 for r in completed),
            ayahs_memorised=sum(
                (r.to_ayah - r.from_ayah + 1)
                for r in completed
                if r.from_ayah is not None and r.to_ayah is not None
            ),
            juzs_completed=sum(1 for j in by_juz if j.complete),
        ),
        by_month=by_month,
        by_juz=by_juz,
    )
