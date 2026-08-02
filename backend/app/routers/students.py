from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_admin

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=list[schemas.StudentOut])
def list_students(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    return db.query(models.Student).order_by(models.Student.name).all()


@router.post("", response_model=schemas.StudentOut, status_code=201)
def create_student(
    payload: schemas.StudentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    if db.query(models.Student).filter(models.Student.name == payload.name).first():
        raise HTTPException(status_code=409, detail="Student already exists")
    student = models.Student(name=payload.name)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.patch("/{student_id}", response_model=schemas.StudentOut)
def update_student(
    student_id: int,
    payload: schemas.StudentUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if payload.name is not None:
        student.name = payload.name
    db.commit()
    db.refresh(student)
    return student


@router.delete("/{student_id}", status_code=204)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
