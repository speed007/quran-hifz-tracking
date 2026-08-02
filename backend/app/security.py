import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt

from .config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def generate_link_code() -> str:
    return secrets.token_hex(4).upper()


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
