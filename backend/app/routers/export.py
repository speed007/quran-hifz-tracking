import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db, require_admin

router = APIRouter(tags=["export"])


@router.get("/export/csv")
def export_csv(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """CSV dump of every session (admins and the creator only)."""
    rows = (
        db.query(
            models.Session,
            models.Student.name.label("student_name"),
            models.Surah.name_en.label("surah_name"),
            models.User.name.label("logged_by_name"),
        )
        .join(models.Student, models.Session.student_id == models.Student.id)
        .outerjoin(models.Surah, models.Session.surah_id == models.Surah.id)
        .outerjoin(models.User, models.Session.logged_by_id == models.User.id)
        .order_by(models.Session.date, models.Session.id)
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "date",
            "student",
            "kind",
            "surah",
            "from_page",
            "to_page",
            "juz",
            "from_ayah",
            "to_ayah",
            "deadline",
            "note",
            "completed",
            "completed_at",
            "rating",
            "feedback",
            "logged_by",
        ]
    )
    for session, student_name, surah_name, logged_by_name in rows:
        writer.writerow(
            [
                session.date.isoformat() if session.date else "",
                student_name,
                session.kind,
                surah_name,
                session.from_page,
                session.to_page,
                session.juz,
                session.from_ayah,
                session.to_ayah,
                session.deadline.isoformat() if session.deadline else "",
                session.note or "",
                "yes" if session.completed else "no",
                session.completed_at.strftime("%Y-%m-%d %H:%M") if session.completed_at else "",
                session.rating if session.rating is not None else "",
                session.feedback or "",
                logged_by_name or "",
            ]
        )

    buf.seek(0)
    filename = "quran-hifz-export.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
