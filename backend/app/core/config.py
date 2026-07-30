"""Typed application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

_REPOSITORY_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    """Runtime settings.

    Defaults make local development predictable, while every value can be overridden
    through the environment. Secrets and connection strings are excluded from reprs.
    """

    model_config = SettingsConfigDict(
        env_file=(Path.cwd() / ".env", _REPOSITORY_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Quanta Data Reliability API"
    app_version: str = "0.3.0"
    environment: Literal["development", "test", "staging", "production"] = "development"
    debug: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_format: Literal["json", "console"] = "json"

    database_url: str = Field(
        default="postgresql+psycopg://quanta:quanta@localhost:5432/quanta",
        repr=False,
    )
    database_echo: bool = False
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=10, ge=0, le=100)
    database_pool_timeout_seconds: int = Field(default=30, ge=1, le=300)

    storage_path: Path = Path("./var/storage")
    max_upload_size_mb: int = Field(default=250, ge=1, le=10_000)
    upload_chunk_size_bytes: int = Field(default=1024 * 1024, ge=64 * 1024, le=16 * 1024 * 1024)
    csv_infer_schema_length: int = Field(default=10_000, ge=100, le=1_000_000)

    profile_default_sample_rows: int = Field(default=100_000, ge=1_000, le=10_000_000)
    profile_top_values_limit: int = Field(default=10, ge=1, le=100)
    profile_max_bytes_in_memory: int = Field(
        default=256 * 1024 * 1024,
        ge=16 * 1024 * 1024,
        le=4 * 1024 * 1024 * 1024,
    )
    profile_null_threshold: float = Field(default=0.5, ge=0.0, le=1.0)

    @property
    def max_upload_size_bytes(self) -> int:
        """Convert the operator-facing MiB limit once for streaming validation."""

        return self.max_upload_size_mb * 1024 * 1024

    llm_provider: str | None = None
    llm_api_key: SecretStr | None = Field(default=None, repr=False)
    llm_model: str | None = None
    redis_url: str | None = Field(default=None, repr=False)

    @field_validator("database_url")
    @classmethod
    def database_must_use_psycopg(cls, value: str) -> str:
        """Reject accidental SQLite or legacy psycopg2 configuration."""

        try:
            url = make_url(value)
        except ArgumentError as exc:
            raise ValueError("DATABASE_URL must be a valid SQLAlchemy URL") from exc

        if url.drivername != "postgresql+psycopg":
            raise ValueError("DATABASE_URL must use the postgresql+psycopg driver")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one immutable-by-convention settings instance per process."""

    return Settings()