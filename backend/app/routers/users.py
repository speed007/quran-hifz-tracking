from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, require_admin, require_creator
from ..security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def _deny() -> HTTPException:
    return HTTPException(status_code=403, detail="You are not allowed to modify this account")


def _assert_can_update(actor: models.User, target: models.User, payload: schemas.UserUpdate) -> None:
    """Enforce the account hierarchy for updates.

    - The creator account can never be disabled, deleted or re-roled by anyone;
      the creator may only edit their own name or password.
    - The creator may manage any other account (users and admins).
    - Admins may manage 'user' accounts and their own name/password; they cannot
      touch other admins, the creator, or change any role.
    """
    if target.role == "creator":
        if actor.id != target.id:
            raise _deny()
        if payload.role is not None or payload.is_active is not None:
            raise _deny()
        return
    if actor.role == "creator":
        return
    # actor is a plain admin here.
    if target.id == actor.id:
        if payload.role is not None:
            raise HTTPException(status_code=403, detail="Only the creator can change roles")
        return
    if target.role != "user":
        raise _deny()
    if payload.role is not None:
        raise HTTPException(status_code=403, detail="Only the creator can change roles")


@router.get("", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db), _: models.User = Depends(require_admin)
):
    return db.query(models.User).order_by(models.User.id).all()


@router.post("", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_admin),
):
    if payload.role == "admin" and actor.role != "creator":
        raise HTTPException(status_code=403, detail="Only the creator can create admins")
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = models.User(
        name=payload.name,
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
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
    actor: models.User = Depends(require_admin),
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
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_creator),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "creator":
        raise _deny()
    db.delete(user)
    db.commit()
