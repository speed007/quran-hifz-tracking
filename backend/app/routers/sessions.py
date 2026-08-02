from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_admin

router = APIRouter(prefix="/sessions", tags=["sessions"])


def validate_session_pages(db: Session, payload: schemas.SessionCreate) -> None:
    surah = db.get(models.Surah, payload.surah_id)
    if surah is None:
        raise HTTPException(status_code=400, detail="Unknown surah")
    if payload.from_page < surah.start_page or payload.to_page > surah.end_page:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Pages must be within {surah.name_en} "
                f"(pages {surah.start_page}-{surah.end_page})"
            ),
        )
    if payload.from_page > payload.to_page:
        raise HTTPException(status_code=400, detail="from_page must be <= to_page")


@router.get("", response_model=list[schemas.SessionDetail])
def list_sessions(
    student_id: int | None = Query(default=None),
    kind: schemas.SessionKind | None = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.Session)
    if student_id is not None:
        q = q.filter(models.Session.student_id == student_id)
    if kind is not None:
        q = q.filter(models.Session.kind == kind)
    rows = q.order_by(models.Session.date.desc(), models.Session.id.desc()).limit(limit).all()
    return _enrich(db, rows)


def _enrich(db: Session, rows: list[models.Session]) -> list[schemas.SessionDetail]:
    out = []
    for row in rows:
        item = schemas.SessionDetail.model_validate(row)
        student = db.get(models.Student, row.student_id)
        surah = db.get(models.Surah, row.surah_id)
        logged_by = db.get(models.User, row.logged_by_id) if row.logged_by_id else None
        item.student_name = student.name if student else None
        item.surah_name_ar = surah.name_ar if surah else None
        item.surah_name_en = surah.name_en if surah else None
        item.logged_by_name = logged_by.name if logged_by else None
        out.append(item)
    return out


@router.post("", response_model=schemas.SessionDetail, status_code=201)
def create_session(
    payload: schemas.SessionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if db.get(models.Student, payload.student_id) is None:
        raise HTTPException(status_code=400, detail="Unknown student")
    validate_session_pages(db, payload)
    row = models.Session(
        student_id=payload.student_id,
        kind=payload.kind,
        surah_id=payload.surah_id,
        from_page=payload.from_page,
        to_page=payload.to_page,
        date=payload.date or date.today(),
        note=payload.note,
        logged_by_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _enrich(db, [row])[0]


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    row = db.get(models.Session, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(row)
    db.commit()
