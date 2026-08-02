import os

# Must be set before any backend.app import so the lru_cached settings
# (and the engine built from them) point at a throwaway DB and MQTT is
# disabled (otherwise lifespan startup tries a 60s TCP connect).
os.environ["HIFZ_DATABASE_URL"] = "sqlite:///./test_hifz.db"
os.environ["HIFZ_MQTT_HOST"] = ""

import pytest
from fastapi.testclient import TestClient

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import AuthToken, LinkCode, Session, Setting, Student, User
from backend.app.seed import seed_database

DB_FILE = "./test_hifz.db"


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_db(client):
    """Reset all tables except the seeded surahs between tests."""
    db = SessionLocal()
    try:
        for model in (Session, AuthToken, LinkCode, Student, Setting, User):
            db.query(model).delete()
        seed_database(db)
    finally:
        db.close()
    yield


@pytest.fixture(scope="session", autouse=True)
def cleanup_dbfile():
    yield
    from backend.app.database import engine

    engine.dispose()
    for path in (DB_FILE, f"{DB_FILE}-wal", f"{DB_FILE}-shm"):
        if os.path.exists(path):
            os.remove(path)
