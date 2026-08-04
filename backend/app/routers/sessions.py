from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_admin
from ..quran_meta import (
    SURAH_START_AYAH,
    juz_ayah_range,
    page_of_ayah,
    page_range_meta,
    page_to_surah_number,
    ruku_range,
    rukus_in_juz,
    ruku_page_range,
    surah_of_ayah,
    surahs_in_range,
)
from ..security import utcnow

router = APIRouter(prefix="/sessions", tags=["sessions"])


def validate_session_pages(from_page: int, to_page: int) -> None:
    if from_page < 1 or to_page > 604:
        raise HTTPException(
            status_code=400,
            detail="Pages must be between 1 and 604",
        )
    if from_page > to_page:
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


@router.get("/juz-ayahs", response_model=schemas.JuzAyahListOut)
def juz_ayahs(
    juz: int = Query(ge=1, le=30),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List every ayah of a juz, numbered from 1 within the juz.

    Students use a 16-line mushaf whose page numbers differ from the app's
    604-page reference, but juz boundaries and ayah numbers match any mushaf.
    """
    first, last = juz_ayah_range(juz)
    surahs_by_number = {s.number: s for s in db.query(models.Surah).all()}
    ayahs = []
    for global_ayah in range(first, last + 1):
        surah_number = surah_of_ayah(global_ayah)
        surah = surahs_by_number.get(surah_number)
        ayahs.append(
            schemas.JuzAyahOut(
                local=global_ayah - first + 1,
                surah_number=surah_number,
                surah_name_ar=surah.name_ar if surah else None,
                surah_name_en=surah.name_en if surah else None,
                ayah=global_ayah - SURAH_START_AYAH[surah_number] + 1,
            )
        )
    return schemas.JuzAyahListOut(
        juz=juz, from_ayah=1, to_ayah=len(ayahs), ayahs=ayahs
    )


@router.get("/ayah-meta", response_model=schemas.AyahMetaOut)
def ayah_meta(
    juz: int = Query(ge=1, le=30),
    from_ayah: int = Query(ge=1),
    to_ayah: int = Query(ge=1),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Resolve an ayah range within a juz into the 604-page reference.

    The surah, ruku and page info is derived (reference only) so sessions can
    be logged purely by "juz + ayah".
    """
    first, last = juz_ayah_range(juz)
    if to_ayah > last - first + 1:
        raise HTTPException(
            status_code=400,
            detail=f"Juz {juz} has only {last - first + 1} ayahs",
        )
    if from_ayah > to_ayah:
        raise HTTPException(status_code=400, detail="from_ayah must be <= to_ayah")
    from_page = page_of_ayah(first + from_ayah - 1)
    to_page = page_of_ayah(first + to_ayah - 1)
    rk_from, rk_to = ruku_range(first + from_ayah - 1, first + to_ayah - 1)
    surahs_by_number = {s.number: s for s in db.query(models.Surah).all()}
    surahs = [
        schemas.SurahRefOut(
            number=n,
            name_ar=surahs_by_number[n].name_ar,
            name_en=surahs_by_number[n].name_en,
        )
        for n in surahs_in_range(first + from_ayah - 1, first + to_ayah - 1)
    ]
    return schemas.AyahMetaOut(
        juz=juz,
        from_ayah=from_ayah,
        to_ayah=to_ayah,
        from_page=from_page,
        to_page=to_page,
        juz_from=juz,
        juz_to=juz,
        ruku_from=rk_from,
        ruku_to=rk_to,
        surahs=surahs,
    )


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
        if row.juz is not None and row.from_ayah is not None and row.to_ayah is not None:
            first, _last = juz_ayah_range(row.juz)
            item.juz_from, item.juz_to = row.juz, row.juz
            item.ruku_from, item.ruku_to = ruku_range(
                first + row.from_ayah - 1, first + row.to_ayah - 1
            )
        elif surah is not None:
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
    if payload.juz is not None:
        if payload.from_ayah is None or payload.to_ayah is None:
            raise HTTPException(
                status_code=400, detail="juz requires from_ayah and to_ayah"
            )
        first, last = juz_ayah_range(payload.juz)
        if not (1 <= payload.from_ayah <= payload.to_ayah <= last - first + 1):
            raise HTTPException(status_code=400, detail="Invalid ayah range for this juz")
        from_page = page_of_ayah(first + payload.from_ayah - 1)
        to_page = page_of_ayah(first + payload.to_ayah - 1)
        surah_number = surah_of_ayah(first + payload.from_ayah - 1)
    else:
        if payload.from_page is None or payload.to_page is None:
            raise HTTPException(
                status_code=400, detail="from_page and to_page are required"
            )
        from_page, to_page = payload.from_page, payload.to_page
        surah_number = page_to_surah_number(from_page)
    validate_session_pages(from_page, to_page)
    surah = (
        db.query(models.Surah).filter(models.Surah.number == surah_number).first()
    )
    if surah is None:
        raise HTTPException(status_code=500, detail="Surah not found")
    row = models.Session(
        student_id=payload.student_id,
        kind=payload.kind,
        surah_id=surah.id,
        from_page=from_page,
        to_page=to_page,
        juz=payload.juz,
        from_ayah=payload.from_ayah,
        to_ayah=payload.to_ayah,
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
    """Mark a session as completed, optionally partial.

    Students complete their own sessions; admins may complete any. A partial
    completion records the ayah range actually done (within the assigned
    range) plus a mandatory note explaining the shortfall.
    """
    row = db.get(models.Session, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if user.role == "user":
        if user.student_id is None or row.student_id != user.student_id:
            raise HTTPException(
                status_code=403, detail="You can only complete your own sessions"
            )
    if not payload.completed:
        row.completed = False
        row.completed_at = None
        row.completion = None
        row.partial_from_ayah = None
        row.partial_to_ayah = None
        row.partial_note = None
    else:
        completion = payload.completion or "full"
        if completion == "partial":
            if (
                row.juz is None
                or row.from_ayah is None
                or row.to_ayah is None
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Partial completion requires a juz + ayah session",
                )
            note = (payload.partial_note or "").strip()
            if not note:
                raise HTTPException(
                    status_code=400,
                    detail="A note explaining why the session was only partially completed is required",
                )
            if (
                payload.partial_from_ayah is None
                or payload.partial_to_ayah is None
                or not (
                    row.from_ayah
                    <= payload.partial_from_ayah
                    <= payload.partial_to_ayah
                    <= row.to_ayah
                )
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Partial range must be within the assigned ayahs "
                        f"{row.from_ayah}–{row.to_ayah} (of this juz)"
                    ),
                )
            row.partial_from_ayah = payload.partial_from_ayah
            row.partial_to_ayah = payload.partial_to_ayah
            row.partial_note = note
        else:
            row.partial_from_ayah = None
            row.partial_to_ayah = None
            row.partial_note = None
        row.completion = completion
        row.completed = True
        row.completed_at = utcnow()
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
