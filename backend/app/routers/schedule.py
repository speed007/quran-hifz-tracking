from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_admin
from ..services import mqtt as mqtt_service
from ..services.reminders import build_schedule_state, slugify

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _resolve_student_id(
    payload_student_id: int | None,
    user: models.User,
    require_admin: bool = False,
) -> int:
    """Return the target student id, enforcing role access rules."""
    if user.role == "user":
        if user.student_id is None:
            raise HTTPException(status_code=403, detail="No linked student")
        if payload_student_id is not None and payload_student_id != user.student_id:
            raise HTTPException(
                status_code=403, detail="You can only manage your own schedule"
            )
        return user.student_id
    if require_admin and user.role not in ("admin", "creator"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if payload_student_id is None:
        raise HTTPException(status_code=400, detail="student_id is required")
    return payload_student_id


def _validate_times(start_time: str, end_time: str) -> None:
    if end_time <= start_time:
        raise HTTPException(
            status_code=400, detail="end_time must be after start_time"
        )


def _validate_slot(day_of_week: int | None, date) -> None:
    if (day_of_week is None) == (date is None):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of day_of_week (recurring) or date (one-off)",
        )


def _to_out(db: Session, rows: list[models.ScheduleEntry]) -> list[schemas.ScheduleEntryOut]:
    out = []
    for row in rows:
        item = schemas.ScheduleEntryOut.model_validate(row)
        student = db.get(models.Student, row.student_id)
        item.student_name = student.name if student else None
        out.append(item)
    return out


def _publish_state(db: Session, student_id: int) -> None:
    student = db.get(models.Student, student_id)
    if student is None:
        return
    rows = (
        db.query(models.ScheduleEntry)
        .filter(models.ScheduleEntry.student_id == student_id)
        .order_by(
            models.ScheduleEntry.day_of_week.asc().nullslast(),
            models.ScheduleEntry.date.asc().nullslast(),
            models.ScheduleEntry.start_time,
        )
        .all()
    )
    mqtt_service.publisher.publish_schedule_state(
        slugify(student.name), build_schedule_state(rows)
    )


@router.get("", response_model=list[schemas.ScheduleEntryOut])
def list_schedule(
    student_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Student timetable. Students see their own; admins may filter or list all."""
    q = db.query(models.ScheduleEntry)
    if user.role == "user":
        if user.student_id is None:
            raise HTTPException(status_code=403, detail="No linked student")
        q = q.filter(models.ScheduleEntry.student_id == user.student_id)
    elif student_id is not None:
        q = q.filter(models.ScheduleEntry.student_id == student_id)
    rows = q.order_by(
        models.ScheduleEntry.day_of_week.asc().nullslast(),
        models.ScheduleEntry.date.asc().nullslast(),
        models.ScheduleEntry.start_time,
    ).all()
    return _to_out(db, rows)


@router.post("", response_model=schemas.ScheduleEntryOut, status_code=201)
def create_schedule_entry(
    payload: schemas.ScheduleEntryIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Students create their own slots; admins may create for any student."""
    student_id = _resolve_student_id(payload.student_id, user)
    if db.get(models.Student, student_id) is None:
        raise HTTPException(status_code=400, detail="Unknown student")
    _validate_slot(payload.day_of_week, payload.date)
    _validate_times(payload.start_time, payload.end_time)
    row = models.ScheduleEntry(
        student_id=student_id,
        label=(payload.label or "Study").strip(),
        day_of_week=payload.day_of_week,
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _publish_state(db, student_id)
    return _to_out(db, [row])[0]


@router.patch("/{entry_id}", response_model=schemas.ScheduleEntryOut)
def update_schedule_entry(
    entry_id: int,
    payload: schemas.ScheduleEntryUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    row = db.get(models.ScheduleEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    if user.role == "user":
        if user.student_id is None or row.student_id != user.student_id:
            raise HTTPException(
                status_code=403, detail="You can only edit your own schedule"
            )
    for field in ("label", "day_of_week", "date", "start_time", "end_time"):
        if field in payload.model_fields_set:
            setattr(row, field, getattr(payload, field))
    _validate_slot(row.day_of_week, row.date)
    _validate_times(row.start_time, row.end_time)
    db.commit()
    db.refresh(row)
    _publish_state(db, row.student_id)
    return _to_out(db, [row])[0]


@router.delete("/{entry_id}", status_code=204)
def delete_schedule_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    row = db.get(models.ScheduleEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    if user.role == "user":
        if user.student_id is None or row.student_id != user.student_id:
            raise HTTPException(
                status_code=403, detail="You can only delete your own schedule"
            )
    db.delete(row)
    db.commit()
    _publish_state(db, row.student_id)


@router.patch("/alexa/{student_id}", response_model=schemas.StudentOut)
def update_student_alexa(
    student_id: int,
    payload: schemas.StudentAlexaUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Enable/disable Alexa schedule reminders for a student and set their lead time."""
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if payload.enabled is not None:
        student.alexa_schedule_enabled = payload.enabled
    if payload.lead_minutes is not None:
        student.alexa_schedule_lead_minutes = payload.lead_minutes
    db.commit()
    db.refresh(student)
    return student


@router.post("/alexa/test/{student_id}")
def test_student_alexa(
    student_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Publish a test announcement for a student so the HA pipe can be verified."""
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    published = mqtt_service.publisher.publish_schedule_reminder(
        slugify(student.name), "This is a test announcement from the Quran app."
    )
    return {"published": published}
