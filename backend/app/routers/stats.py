from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..routers.sessions import _enrich
from ..services.progress import compute_progress

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

    q = db.query(models.Session)
    if user.role == "user":
        q = q.filter(models.Session.student_id == user.student_id)
    recent = q.order_by(models.Session.date.desc(), models.Session.id.desc()).limit(15).all()
    enriched = _enrich(db, recent)

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
