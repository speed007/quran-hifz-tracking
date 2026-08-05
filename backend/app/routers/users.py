from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_admin
from ..security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def _deny() -> HTTPException:
    return HTTPException(status_code=403, detail="You are not allowed to modify this account")


def _validate_student_link(
    db: Session, student_id: int | None, exclude_user_id: int | None = None
) -> int | None:
    """Validate a student link and enforce one-user-per-student."""
    if student_id is None:
        return None
    if db.get(models.Student, student_id) is None:
        raise HTTPException(status_code=400, detail="Unknown student")
    taken = db.query(models.User).filter(models.User.student_id == student_id)
    if exclude_user_id is not None:
        taken = taken.filter(models.User.id != exclude_user_id)
    taken = taken.first()
    if taken is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Student is already linked to user '{taken.username}'",
        )
    return student_id


def _assert_can_update(actor: models.User, target: models.User, payload: schemas.UserUpdate) -> None:
    """Enforce the account hierarchy for updates.

    - The creator account can never be disabled, deleted or re-roled by anyone;
      the creator may only edit their own name or password.
    - The creator may manage any other account (users and admins).
    - Admins may manage their own name/password and any 'user' account (e.g. a
      student's login); they cannot touch other admins, the creator, or change
      any role.
    - Plain users may only change their own name or password.
    """
    if target.role == "creator":
        if actor.id != target.id:
            raise _deny()
        if payload.role is not None or payload.is_active is not None:
            raise _deny()
        return
    if actor.role == "creator":
        return
    if actor.role == "user":
        if target.id != actor.id:
            raise _deny()
        if (
            payload.role is not None
            or payload.is_active is not None
            or "student_id" in payload.model_fields_set
        ):
            raise HTTPException(
                status_code=403, detail="You can only change your own name or password"
            )
        return
    # actor is a plain admin here.
    if target.id == actor.id:
        if payload.role is not None or payload.is_active is not None:
            raise HTTPException(
                status_code=403, detail="Only the creator can change roles or disable accounts"
            )
        return
    if target.role != "user":
        raise _deny()
    if payload.role is not None:
        raise HTTPException(status_code=403, detail="Only the creator can change roles")


@router.get("", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db), actor: models.User = Depends(get_current_user)
):
    """The creator sees all users; everyone else only their own account."""
    if actor.role != "creator":
        actor = db.get(models.User, actor.id)
        return [actor]
    return db.query(models.User).order_by(models.User.id).all()


@router.get("/student-logins", response_model=list[schemas.UserOut])
def student_logins(
    db: Session = Depends(get_db), _: models.User = Depends(require_admin)
):
    """Logins linked to students, used by the Students page."""
    return (
        db.query(models.User)
        .filter(models.User.role == "user", models.User.student_id.is_not(None))
        .order_by(models.User.id)
        .all()
    )


@router.post("", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    actor: models.User = Depends(get_current_user),
):
    if actor.role == "user":
        raise HTTPException(
            status_code=403, detail="Only admins or the creator can create users"
        )
    if payload.role == "admin" and actor.role != "creator":
        raise HTTPException(status_code=403, detail="Only the creator can create admins")
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = models.User(
        name=payload.name,
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        student_id=_validate_student_link(db, payload.student_id),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    actor: models.User = Depends(get_current_user),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _assert_can_update(actor, user, payload)
    if payload.name is not None:
        user.name = payload.name
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if "student_id" in payload.model_fields_set:
        user.student_id = _validate_student_link(db, payload.student_id, exclude_user_id=user.id)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: models.User = Depends(get_current_user),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "creator":
        raise _deny()
    if actor.role == "user":
        raise _deny()
    if actor.role == "admin" and user.role != "user":
        raise _deny()
    db.delete(user)
    db.commit()
