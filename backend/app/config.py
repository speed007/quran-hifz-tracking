from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="HIFZ_",
        extra="ignore",
    )

    app_name: str = "Quran Hifz Tracker"
    database_url: str = "sqlite:///./hifz.db"
    secret_key: str = "change-me-in-production"
    timezone: str = "Europe/London"

    session_ttl_days: int = 30
    link_code_ttl_minutes: int = 10

    telegram_bot_token: str = ""
    telegram_daily_time: str = "18:00"

    mqtt_host: str = ""  # empty disables MQTT; set HIFZ_MQTT_HOST to your broker
    mqtt_port: int = 1883
    mqtt_user: str = ""
    mqtt_pass: str = ""

    alexa_enabled: bool = True
    alexa_weekday_time: str = "16:00"
    alexa_weekend_time: str = "11:00"
    revision_lookback_pages: int = 3

    default_admin_username: str = "admin"
    default_admin_password: str = "admin"
    default_admin_name: str = "Admin"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
