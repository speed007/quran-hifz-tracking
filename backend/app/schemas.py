from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SessionKind = Literal["new", "revision"]
Role = Literal["creator", "admin", "user"]
CreatableRole = Literal["admin", "user"]


class SurahOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: int
    name_ar: str
    name_en: str
    start_page: int
    end_page: int


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    username: str
    role: Role
    telegram_id: int | None = None
    is_active: bool


class UserCreate(BaseModel):
    name: str
    username: str
    password: str = Field(min_length=6)
    role: CreatableRole = "user"


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = Field(default=None, min_length=6)
    role: CreatableRole | None = None
    is_active: bool | None = None


class StudentCreate(BaseModel):
    name: str


class StudentUpdate(BaseModel):
    name: str | None = None


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class SessionCreate(BaseModel):
    student_id: int
    kind: SessionKind = "new"
    from_page: int
    to_page: int
    date: date_type | None = None
    deadline: date_type | None = None
    note: str | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    kind: SessionKind
    surah_id: int
    from_page: int
    to_page: int
    date: date_type
    note: str | None = None
    logged_by_id: int | None = None
    created_at: datetime


class SessionDetail(SessionOut):
    student_name: str | None = None
    surah_name_ar: str | None = None
    surah_name_en: str | None = None
    logged_by_name: str | None = None
    juz_from: int | None = None
    juz_to: int | None = None
    ruku_from: int | None = None
    ruku_to: int | None = None
    assigned_by_name: str | None = None
    deadline: date_type | None = None


class SectionMetaOut(BaseModel):
    juz_from: int
    juz_to: int
    ruku_from: int
    ruku_to: int


class LinkCodeOut(BaseModel):
    code: str
    expires_at: datetime


class SettingsOut(BaseModel):
    telegram_daily_time: str
    alexa_enabled: bool
    alexa_weekday_time: str
    alexa_weekend_time: str
    revision_lookback_pages: int


class SettingsUpdate(BaseModel):
    telegram_daily_time: str | None = None
    alexa_enabled: bool | None = None
    alexa_weekday_time: str | None = None
    alexa_weekend_time: str | None = None
    revision_lookback_pages: int | None = None


class ProgressOut(BaseModel):
    total_pages: int = 604
    memorised_pages: int
    percent: float
    rukus_memorised: int = 0
    total_rukus: int = 556
    current_surah: SurahOut | None = None
    current_page: int | None = None


class StatsOut(BaseModel):
    students: list[StudentOut]
    progress: dict[int, ProgressOut]
    recent_sessions: list[SessionDetail]
    today_activity: int
    total_sessions: int
