import asyncio
import logging
import threading
from datetime import datetime

from sqlalchemy.orm import Session
from telegram import Bot, Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from .. import models
from ..config import get_settings
from ..database import SessionLocal
from ..security import utcnow
from .parser import ParseError, parse_session_message, parse_settings_message
from .progress import compute_progress
from .settings import get_settings_dict, update_setting
from . import mqtt as mqtt_service

logger = logging.getLogger(__name__)
settings = get_settings()

_kind_label = {"new": "memorised", "revision": "revised"}


class TelegramBot:
    def __init__(self) -> None:
        self._app: Application | None = None
        self._thread: threading.Thread | None = None

    @property
    def enabled(self) -> bool:
        return bool(settings.telegram_bot_token)

    def start(self) -> None:
        if not self.enabled:
            logger.info("Telegram bot disabled (no token configured)")
            return
        app = Application.builder().token(settings.telegram_bot_token).build()
        app.add_handler(CommandHandler("start", self._cmd_start))
        app.add_handler(CommandHandler(["help", "h"], self._cmd_help))
        app.add_handler(CommandHandler(["today", "stats", "s"], self._cmd_today))
        app.add_handler(CommandHandler(["reminders", "reminder"], self._cmd_reminders))
        app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_text)
        )
        self._app = app
        self._thread = threading.Thread(
            target=app.run_polling,
            kwargs={"stop_signals": ()},
            daemon=True,
        )
        self._thread.start()
        logger.info("Telegram bot started (polling)")

    def shutdown(self) -> None:
        if self._app is not None:
            self._app.stop_running()
            self._app = None

    # ---- helpers -----------------------------------------------------------

    @staticmethod
    def _is_admin(user: models.User) -> bool:
        return user.role in ("admin", "creator")

    def _send_daily_summary(self, now: datetime) -> None:
        if not self.enabled or self._app is None:
            return
        db: Session = SessionLocal()
        try:
            admins = (
                db.query(models.User)
                .filter(
                    models.User.role.in_(("admin", "creator")),
                    models.User.telegram_id.isnot(None),
                    models.User.is_active.is_(True),
                )
                .all()
            )
            if not admins:
                return
            lines = ["Daily hifz summary:"]
            students = db.query(models.Student).all()
            for student in students:
                progress = compute_progress(db, student.id)
                current = (
                    f"{student.name}: {progress.memorised_pages}/{progress.total_pages} "
                    f"pages ({progress.percent}%)"
                )
                lines.append(current)
            lines.append(f"Sessions today: {_today_count(db)}")
            text = "\n".join(lines)
            for admin in admins:
                try:
                    self._app.bot.send_message(chat_id=admin.telegram_id, text=text)
                except Exception as exc:
                    logger.warning("Telegram summary to %s failed: %s", admin.username, exc)
        finally:
            db.close()

    # ---- handlers ----------------------------------------------------------

    async def _cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = update.effective_chat.id
        args = context.args or []
        if not args:
            await update.message.reply_text(
                "Welcome to the hifz tracker. To link your Telegram account, ask an "
                "admin for a code and send:\n/start <code>"
            )
            return
        code = args[0].strip().upper()
        db: Session = SessionLocal()
        try:
            record = (
                db.query(models.LinkCode)
                .filter(models.LinkCode.code == code)
                .first()
            )
            if record is None:
                await update.message.reply_text("That code isn't recognised.")
                return
            if record.used_at is not None or record.expires_at < utcnow():
                await update.message.reply_text("That code has expired or already been used.")
                return
            user = db.get(models.User, record.user_id)
            if user is None:
                await update.message.reply_text("Linked account not found.")
                return
            user.telegram_id = chat_id
            record.used_at = utcnow()
            db.commit()
            await update.message.reply_text(
                f"Linked to {user.name} ({user.role}). You can now log sessions, e.g. "
                "'Ahmed new 15 to 18' or 'Ahmed revision Yaseen 35 to 37'."
            )
        finally:
            db.close()

    async def _cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await update.message.reply_text(
            "Commands:\n"
            "/start <code> - link your account\n"
            "/today - show today's progress\n"
            "/reminder <time> - set the weekday Alexa reminder time\n"
            "Log a session: '<student> new 15 to 18' or "
            "'<student> revision <surah> 35 to 37'\n"
            "Settings: 'reminder 16:00', 'weekend 11:00', 'daily 18:00'"
        )

    async def _cmd_today(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        db: Session = SessionLocal()
        try:
            user = _user_by_chat(db, update.effective_chat.id)
            if user is None or not self._is_admin(user):
                await update.message.reply_text("Only linked admins can view stats.")
                return
            lines = []
            students = db.query(models.Student).all()
            for student in students:
                progress = compute_progress(db, student.id)
                lines.append(
                    f"{student.name}: {progress.memorised_pages}/{progress.total_pages} "
                    f"pages ({progress.percent}%)"
                )
            lines.append(f"Sessions today: {_today_count(db)}")
            await update.message.reply_text("\n".join(lines) or "No students yet.")
        finally:
            db.close()

    async def _cmd_reminders(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        db: Session = SessionLocal()
        try:
            user = _user_by_chat(db, update.effective_chat.id)
            if user is None or not self._is_admin(user):
                await update.message.reply_text("Only linked admins can change reminders.")
                return
            s = get_settings_dict(db)
            await update.message.reply_text(
                f"Alexa reminders: {'on' if s.alexa_enabled else 'off'}\n"
                f"Weekday: {s.alexa_weekday_time}\n"
                f"Weekend: {s.alexa_weekend_time}\n"
                f"Daily summary: {s.telegram_daily_time}\n"
                "Change them with 'reminder 16:00', 'weekend 11:00', 'daily 18:00'."
            )
        finally:
            db.close()

    async def _on_text(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        text = (update.message.text or "").strip()
        chat_id = update.effective_chat.id
        db: Session = SessionLocal()
        try:
            user = _user_by_chat(db, chat_id)
            if user is None:
                await update.message.reply_text(
                    "You're not linked yet. Ask an admin for a code and send /start <code>."
                )
                return

            if not self._is_admin(user):
                await update.message.reply_text("Only admins can log sessions.")
                return

            # Settings messages take priority if they match.
            if _looks_like_settings(text):
                parsed = parse_settings_message(text)
                if parsed.error:
                    await update.message.reply_text(parsed.error)
                    return
                field = {
                    "weekday": "alexa_weekday_time",
                    "weekend": "alexa_weekend_time",
                    "daily": "telegram_daily_time",
                }[parsed.kind]
                update_setting(db, field, parsed.data)
                label = {
                    "weekday": "Weekday Alexa reminder",
                    "weekend": "Weekend Alexa reminder",
                    "daily": "Daily Telegram summary",
                }[parsed.kind]
                await update.message.reply_text(f"{label} set to {parsed.data}.")
                return

            try:
                parsed = parse_session_message(db, text)
            except ParseError as exc:
                await update.message.reply_text(str(exc))
                return

            row = models.Session(
                student_id=parsed.student.id,
                kind=parsed.kind,
                surah_id=parsed.surah.id,
                from_page=parsed.from_page,
                to_page=parsed.to_page,
                logged_by_id=user.id,
            )
            db.add(row)
            db.commit()
            await update.message.reply_text(
                f"Logged: {parsed.student.name} {_kind_label[parsed.kind]} "
                f"pages {parsed.from_page}-{parsed.to_page} "
                f"({parsed.surah.name_en})."
            )
        finally:
            db.close()


def _user_by_chat(db: Session, chat_id: int) -> models.User | None:
    return db.query(models.User).filter(models.User.telegram_id == chat_id).first()


def _today_count(db: Session) -> int:
    from sqlalchemy import func

    return (
        db.query(func.count(models.Session.id))
        .filter(models.Session.date == datetime.now().date())
        .scalar()
        or 0
    )


def _looks_like_settings(text: str) -> bool:
    lowered = text.lower()
    return any(
        kw in lowered
        for kw in ("reminder", "weekend", "weekday", "daily", "alexa")
    ) and ":" in text


bot = TelegramBot()
