from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..services.progress import compute_progress

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=schemas.StatsOut)
def stats(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    students = db.query(models.Student).order_by(models.Student.name).all()
    progress = {
        s.id: compute_progress(db, s.id) for s in students
    }

    recent = (
        db.query(models.Session)
        .order_by(models.Session.date.desc(), models.Session.id.desc())
        .limit(15)
        .all()
    )
    enriched = []
    for row in recent:
        item = schemas.SessionDetail.model_validate(row)
        student = db.get(models.Student, row.student_id)
        surah = db.get(models.Surah, row.surah_id)
        logged_by = db.get(models.User, row.logged_by_id) if row.logged_by_id else None
        item.student_name = student.name if student else None
        item.surah_name_ar = surah.name_ar if surah else None
        item.surah_name_en = surah.name_en if surah else None
        item.logged_by_name = logged_by.name if logged_by else None
        enriched.append(item)

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
    )
