"""Unit tests for typed environment configuration."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_accept_supported_postgresql_driver() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@db:5432/quanta",
        database_pool_size=7,
    )

    assert settings.database_pool_size == 7
    assert settings.environment == "development"


@pytest.mark.parametrize(
    "database_url",
    ["sqlite:///local.db", "postgresql+psycopg2://user:pass@db/quanta", "not-a-url"],
)
def test_settings_reject_unsupported_database_urls(database_url: str) -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None, database_url=database_url)


def test_connection_strings_and_secrets_are_not_in_repr() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:super-secret@db/quanta",
        llm_api_key="also-secret",
        redis_url="redis://:redis-secret@redis:6379",
    )

    representation = repr(settings)
    assert "super-secret" not in representation
    assert "also-secret" not in representation
    assert "redis-secret" not in representation
