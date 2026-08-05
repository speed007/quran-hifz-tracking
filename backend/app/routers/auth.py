from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..deps import get_db, get_current_user, require_creator
from ..security import (
    generate_link_code,
    generate_session_token,
    hash_password,
    hash_token,
    utcnow,
    verify_password,
)

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.UserOut)
def login(payload: schemas.LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = generate_session_token()
    record = models.AuthToken(
        token_hash=hash_token(token),
        user_id=user.id,
        expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
    )
    db.add(record)
    db.commit()

    response.set_cookie(
        key="hifz_session",
        value=token,
        httponly=True,
        samesite="strict",
        secure=False,
        max_age=settings.session_ttl_days * 24 * 3600,
        path="/",
    )
    return user


@router.post("/mobile-login", response_model=schemas.MobileLoginOut)
def mobile_login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = generate_session_token()
    record = models.AuthToken(
        token_hash=hash_token(token),
        user_id=user.id,
        expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
    )
    db.add(record)
    db.commit()

    return schemas.MobileLoginOut(token=token, expires_at=record.expires_at, user=user)


@router.post("/logout")
def logout(response: Response, db: Session = Depends(get_db)):
    # Token revocation is handled by clearing the cookie; a missing token is fine.
    response.delete_cookie("hifz_session", path="/")
    return {"ok": True}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.post("/link-code", response_model=schemas.LinkCodeOut)
def create_link_code(
    user: models.User = Depends(require_creator),
    db: Session = Depends(get_db),
):
    code = None
    for _ in range(10):
        candidate = models.LinkCode(
            code=generate_link_code(),
            user_id=user.id,
            expires_at=utcnow() + timedelta(minutes=settings.link_code_ttl_minutes),
        )
        existing = db.query(models.LinkCode).filter(models.LinkCode.code == candidate.code).first()
        if existing is None:
            code = candidate
            break
    if code is None:
        raise HTTPException(status_code=500, detail="Could not generate link code")
    db.add(code)
    db.commit()
    return code
