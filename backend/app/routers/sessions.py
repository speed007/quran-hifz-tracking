from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_admin
from ..quran_meta import page_range_meta, page_of_ayah, page_to_surah_number, rukus_in_juz, ruku_page_range
from ..security import utcnow

router = APIRouter(prefix="/sessions", tags=["sessions"])


def validate_session_pages(db: Session, payload: schemas.SessionCreate) -> None:
    if payload.from_page < 1 or payload.to_page > 604:
        raise HTTPException(
            status_code=400,
            detail="Pages must be between 1 and 604",
        )
    if payload.from_page > payload.to_page:
        raise HTTPException(status_code=400, detail="from_page must be <= to_page")


@router.get("/rukus-in-juz")
def rukus_in_juz_endpoint(
    juz: int = Query(ge=1, le=30),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    first, last = rukus_in_juz(juz)
    return {"first_ruku": first, "last_ruku": last, "rukus": list(range(first, last + 1))}


@router.get("/ruku-pages")
def ruku_pages_endpoint(
    ruku: int = Query(ge=1, le=556),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    from_page, to_page = ruku_page_range(ruku)
    surah_number = page_to_surah_number(from_page)
    surah = db.query(models.Surah).filter(models.Surah.number == surah_number).first()
    return {
        "from_page": from_page,
        "to_page": to_page,
        "surah_number": surah_number,
        "surah_name_en": surah.name_en if surah else None,
    }


@router.get("/section-meta", response_model=schemas.SectionMetaOut)
def section_meta(
    surah_id: int,
    from_page: int,
    to_page: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    surah = db.get(models.Surah, surah_id)
    if surah is None:
        raise HTTPException(status_code=400, detail="Unknown surah")
    if from_page < surah.start_page or to_page > surah.end_page:
        raise HTTPException(status_code=400, detail="Pages outside surah range")
    if from_page > to_page:
        raise HTTPException(status_code=400, detail="from_page must be <= to_page")
    jz_from, jz_to, rk_from, rk_to = page_range_meta(
        from_page, to_page
    )
    return schemas.SectionMetaOut(
        juz_from=jz_from, juz_to=jz_to, ruku_from=rk_from, ruku_to=rk_to
    )


@router.get("", response_model=list[schemas.SessionDetail])
def list_sessions(
    student_id: int | None = Query(default=None),
    kind: schemas.SessionKind | None = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.Session)
    if user.role == "user" and user.student_id is not None:
        q = q.filter(models.Session.student_id == user.student_id)
    elif student_id is not None:
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
        assigned_by = db.get(models.User, row.assigned_by_id) if row.assigned_by_id else None
        item.student_name = student.name if student else None
        item.surah_name_ar = surah.name_ar if surah else None
        item.surah_name_en = surah.name_en if surah else None
        item.logged_by_name = logged_by.name if logged_by else None
        item.assigned_by_name = assigned_by.name if assigned_by else None
        item.deadline = row.deadline
        rated_by = db.get(models.User, row.rated_by_id) if row.rated_by_id else None
        item.rated_by_name = rated_by.name if rated_by else None
        if surah is not None:
            jz_from, jz_to, rk_from, rk_to = page_range_meta(
                row.from_page, row.to_page
            )
            item.juz_from, item.juz_to = jz_from, jz_to
            item.ruku_from, item.ruku_to = rk_from, rk_to
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
    surah_number = page_to_surah_number(payload.from_page)
    surah = (
        db.query(models.Surah).filter(models.Surah.number == surah_number).first()
    )
    if surah is None:
        raise HTTPException(status_code=500, detail="Surah not found")
    row = models.Session(
        student_id=payload.student_id,
        kind=payload.kind,
        surah_id=surah.id,
        from_page=payload.from_page,
        to_page=payload.to_page,
        date=payload.date or date.today(),
        deadline=payload.deadline,
        note=payload.note,
        logged_by_id=user.id,
        assigned_by_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _enrich(db, [row])[0]


@router.patch("/{session_id}/complete", response_model=schemas.SessionDetail)
def set_session_completed(
    session_id: int,
    payload: schemas.SessionCompleteIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Mark a session as completed (student ticks their own; admins may tick any)."""
    row = db.get(models.Session, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if user.role == "user":
        if user.student_id is None or row.student_id != user.student_id:
            raise HTTPException(
                status_code=403, detail="You can only complete your own sessions"
            )
    row.completed = payload.completed
    row.completed_at = utcnow() if payload.completed else None
    db.commit()
    db.refresh(row)
    return _enrich(db, [row])[0]


@router.patch("/{session_id}/rating", response_model=schemas.SessionDetail)
def rate_session(
    session_id: int,
    payload: schemas.SessionRatingIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Give 1-5 stars and/or written feedback for a completed session."""
    row = db.get(models.Session, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not row.completed:
        raise HTTPException(
            status_code=400, detail="Only completed sessions can be rated"
        )
    if "rating" in payload.model_fields_set:
        row.rating = payload.rating
    if "feedback" in payload.model_fields_set:
        row.feedback = payload.feedback
    row.rated_by_id = user.id
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
