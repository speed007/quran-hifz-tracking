import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
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
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
