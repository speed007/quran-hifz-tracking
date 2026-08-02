from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import AuthToken, User
from .security import hash_token


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("hifz_session")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    token_hash = hash_token(token)
    record = db.query(AuthToken).filter(AuthToken.token_hash == token_hash).first()
    if record is None or record.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    if record.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled"
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "creator"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_creator(user: User = Depends(get_current_user)) -> User:
    if user.role != "creator":
        raise HTTPException(status_code=403, detail="Creator access required")
    return user
