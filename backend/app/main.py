import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import Base, SessionLocal, engine
from .routers import auth, sessions, settings, stats, students, surahs, users
from .seed import seed_database
from .services import mqtt as mqtt_service
from .services.scheduler import scheduler
from .services.telegram import bot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

cfg = get_settings()

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def migrate_db(db: SessionLocal) -> None:
    """Add missing columns to existing tables without dropping data."""
    conn = db.connection()
    cursor = conn.connection.cursor()

    # users table: add student_id if missing
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    if "student_id" not in columns:
        cursor.execute(
            "ALTER TABLE users ADD COLUMN student_id INTEGER REFERENCES students(id)"
        )
        conn.commit()

    # sessions table: add deadline and assigned_by_id if missing
    cursor.execute("PRAGMA table_info(sessions)")
    columns = {row[1] for row in cursor.fetchall()}
    if "deadline" not in columns:
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN deadline DATE"
        )
        conn.commit()
    if "assigned_by_id" not in columns:
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN assigned_by_id INTEGER REFERENCES users(id)"
        )
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        migrate_db(db)
        seed_database(db)
    finally:
        db.close()

    mqtt_service.publisher.connect()
    bot.start()

    from .services.settings import get_settings_dict

    def telegram_tick(now: datetime) -> None:
        db = SessionLocal()
        try:
            s = get_settings_dict(db)
            if s.telegram_daily_time == now.strftime("%H:%M"):
                bot._send_daily_summary(now)
        finally:
            db.close()

    def alexa_tick(now: datetime) -> None:
        db = SessionLocal()
        try:
            from .services.revision import schedule_for_today

            for student, slug, message in schedule_for_today(db):
                mqtt_service.publisher.publish_revision(slug, message)
        finally:
            db.close()

    scheduler.on_minute(telegram_tick)
    scheduler.on_minute(alexa_tick)
    scheduler.start()

    yield

    scheduler.shutdown()
    bot.shutdown()
    mqtt_service.publisher.shutdown()


app = FastAPI(title=cfg.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(surahs.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": cfg.app_name}


if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")
