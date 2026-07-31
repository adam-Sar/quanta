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
    app_version: str = "1.1.0"
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

    # Task 5 scoring settings. The formula version is intentionally
    # exposed so operators can verify which deterministic formula was
    # used for a given run.
    score_formula_version: str = Field(default="task5-1.0", min_length=1, max_length=64)
    score_normalization_divisor_floor: int = Field(default=1, ge=1, le=10_000)
    score_max_columns_for_normalization: int = Field(default=10_000, ge=1, le=1_000_000)

    # Task 6 history settings. Thresholds default to the documented
    # values; bump ``HISTORY_FORMULA_VERSION`` when they change.
    history_formula_version: str = Field(default="task6-1.0", min_length=1, max_length=64)
    history_numeric_relative_change_medium: float = Field(default=0.20, ge=0.0, le=10.0)
    history_numeric_relative_change_high: float = Field(default=0.50, ge=0.0, le=10.0)
    history_categorical_psi_low: float = Field(default=0.10, ge=0.0, le=10.0)
    history_categorical_psi_medium: float = Field(default=0.20, ge=0.0, le=10.0)
    history_score_delta_low: float = Field(default=5.0, ge=0.0, le=100.0)
    history_score_delta_medium: float = Field(default=10.0, ge=0.0, le=100.0)
    history_score_delta_high: float = Field(default=20.0, ge=0.0, le=100.0)

    # Task 7 AI reasoning settings. The default is the offline noop
    # provider so tests and offline runs stay fast and deterministic.
    # ai_formula_version is persisted on every interpretation row for
    # audit. ai_max_findings_per_request bounds the prompt; real provider
    # SDKs land in a later task.
    ai_formula_version: str = Field(default="task7-1.0", min_length=1, max_length=64)
    ai_max_findings_per_request: int = Field(default=20, ge=1, le=200)
    ai_prompt_char_budget: int = Field(default=8_000, ge=256, le=131_072)

    # Task 8 recommendations settings. The deterministic rule engine
    # is bounded by ``recommendation_max_per_run``; rows above the cap
    # are trimmed by descending priority so consumers always see the
    # most actionable subset first.
    recommendation_formula_version: str = Field(
        default="task8-1.0", min_length=1, max_length=64
    )
    recommendation_max_per_run: int = Field(default=50, ge=1, le=500)

    # Task 9 validation settings. The deterministic preview engine
    # is bounded by ``profile_default_sample_rows`` (shared with the
    # Task 3 profiler) so a pathological dataset cannot exhaust the
    # API worker's memory during a validation preview.
    validation_formula_version: str = Field(
        default="task9-1.0", min_length=1, max_length=64
    )

    # Task 10 jobs settings. The jobs layer is the durable wrapper
    # around the Task 2-9 analysis operations; the formula version is
    # persisted on every ``Job`` row so a future task can audit
    # persisted rows against the active dispatcher.
    job_formula_version: str = Field(
        default="task10-1.0", min_length=1, max_length=64
    )

    # Task 11 hardening settings. The rate limiter and request-budget
    # guard are operator-facing knobs. ``rate_limit_capacity`` requests
    # per ``rate_limit_window_seconds`` are allowed per
    # ``(client_key, scope)``; ``request_budget_ms`` is the soft wall
    # at which the request-time middleware records a warning (and may
    # be promoted to a 504 in a future task). ``max_request_bytes``
    # bounds the request body for routes that opt in (dataset and
    # jobs ingestion); the existing ``max_upload_size_mb`` already
    # bounds the streaming upload path.
    rate_limit_capacity: int = Field(default=120, ge=1, le=10_000)
    rate_limit_window_seconds: float = Field(default=60.0, ge=0.1, le=3_600.0)
    request_budget_ms: int = Field(default=15_000, ge=100, le=600_000)
    max_request_bytes: int = Field(
        default=1_048_576,
        ge=1_024,
        le=64 * 1_048_576,
    )
    metrics_buffer_capacity: int = Field(default=256, ge=16, le=4_096)

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
