from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Surah(Base):
    __tablename__ = "surahs"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(64))
    name_en: Mapped[str] = mapped_column(String(64))
    start_page: Mapped[int] = mapped_column(Integer)
    end_page: Mapped[int] = mapped_column(Integer)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="user")
    telegram_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    student_id: Mapped[int | None] = mapped_column(
        ForeignKey("students.id", ondelete="SET NULL"), nullable=True
    )

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="logged_by", foreign_keys="Session.logged_by_id"
    )


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="student", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), default="new")
    surah_id: Mapped[int] = mapped_column(ForeignKey("surahs.id"))
    from_page: Mapped[int] = mapped_column(Integer)
    to_page: Mapped[int] = mapped_column(Integer)
    juz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    from_ayah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    to_ayah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date: Mapped[date] = mapped_column(Date, index=True, server_default=func.date("now"))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    logged_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    rated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    student: Mapped["Student"] = relationship(back_populates="sessions")
    surah: Mapped["Surah"] = relationship()
    logged_by: Mapped["User | None"] = relationship(
        back_populates="sessions", foreign_keys="Session.logged_by_id"
    )
    assigned_by: Mapped["User | None"] = relationship(
        foreign_keys="Session.assigned_by_id", overlaps="logged_by,sessions"
    )


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship()


class LinkCode(Base):
    __tablename__ = "link_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship()
