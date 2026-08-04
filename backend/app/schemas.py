from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SessionKind = Literal["new", "revision"]
CompletionKind = Literal["full", "partial"]
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
    student_id: int | None = None


class UserCreate(BaseModel):
    name: str
    username: str
    password: str = Field(min_length=6)
    role: CreatableRole = "user"
    student_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = Field(default=None, min_length=6)
    role: CreatableRole | None = None
    is_active: bool | None = None
    student_id: int | None = None


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
    from_page: int | None = None
    to_page: int | None = None
    juz: int | None = Field(default=None, ge=1, le=30)
    from_ayah: int | None = Field(default=None, ge=1)
    to_ayah: int | None = Field(default=None, ge=1)
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
    juz: int | None = None
    from_ayah: int | None = None
    to_ayah: int | None = None
    date: date_type
    note: str | None = None
    logged_by_id: int | None = None
    created_at: datetime
    completed: bool = False
    completed_at: datetime | None = None
    completion: str | None = None
    partial_from_ayah: int | None = None
    partial_to_ayah: int | None = None
    partial_note: str | None = None
    rating: int | None = None
    feedback: str | None = None


class SessionCompleteIn(BaseModel):
    completed: bool
    completion: CompletionKind | None = None
    partial_from_ayah: int | None = Field(default=None, ge=1)
    partial_to_ayah: int | None = Field(default=None, ge=1)
    partial_note: str | None = Field(default=None, max_length=1000)


class SessionRatingIn(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    feedback: str | None = Field(default=None, max_length=1000)


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
    rated_by_name: str | None = None


class SurahRefOut(BaseModel):
    number: int
    name_ar: str
    name_en: str


class JuzAyahOut(BaseModel):
    local: int
    surah_number: int
    surah_name_ar: str | None = None
    surah_name_en: str | None = None
    ayah: int


class JuzAyahListOut(BaseModel):
    juz: int
    from_ayah: int
    to_ayah: int
    ayahs: list[JuzAyahOut]


class AyahMetaOut(BaseModel):
    juz: int
    from_ayah: int
    to_ayah: int
    from_page: int
    to_page: int
    juz_from: int
    juz_to: int
    ruku_from: int
    ruku_to: int
    surahs: list[SurahRefOut]


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


class JuzSummaryOut(BaseModel):
    juz: int
    page_from: int
    page_to: int
    pages_memorised: int
    total_pages: int
    complete: bool
    sessions: int
    rated_sessions: int
    avg_rating: float | None = None
    duration_days: int | None = None


class StatsOut(BaseModel):
    students: list[StudentOut]
    progress: dict[int, ProgressOut]
    recent_sessions: list[SessionDetail]
    today_activity: int
    total_sessions: int
    juz_summary: dict[int, list[JuzSummaryOut]] = {}
    rateable_sessions: list[SessionDetail] = []
    rated_sessions: list[SessionDetail] = []


class HistoryMonthOut(BaseModel):
    month: str
    sessions: int
    pages: int
    ayahs: int
    stars: int
    avg_rating: float | None = None


class HistoryJuzOut(BaseModel):
    juz: int
    pages_memorised: int
    total_pages: int
    percent: float
    complete: bool
    sessions: int
    rated_sessions: int
    avg_rating: float | None = None
    duration_days: int | None = None


class HistoryStarsOut(BaseModel):
    rating: int | None = None
    sessions: int
    pages: int
    ayahs: int


class HistorySummaryOut(BaseModel):
    student_id: int
    student_name: str
    season_start: date_type | None = None
    first_session: date_type | None = None
    last_session: date_type | None = None
    total_sessions: int
    completed_sessions: int
    rated_sessions: int
    total_stars: int
    avg_rating: float | None = None
    pages_memorised: int
    ayahs_memorised: int
    juzs_completed: int


class HistoryOut(BaseModel):
    summary: HistorySummaryOut
    by_month: list[HistoryMonthOut]
    by_juz: list[HistoryJuzOut]
    by_stars: list[HistoryStarsOut] = []
    sessions: list[SessionDetail] = []


class ScheduleEntryIn(BaseModel):
    student_id: int | None = None
    label: str | None = Field(default=None, max_length=128)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    date: date_type | None = None
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class ScheduleEntryUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=128)
    day_of_week: int | None = None
    date: date_type | None = None
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")


class ScheduleEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    label: str
    day_of_week: int | None = None
    date: date_type | None = None
    start_time: str
    end_time: str
    created_at: datetime
    student_name: str | None = None
