"""Unit tests for the Task 11 limits helper."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.exceptions import RequestTooLargeError
from app.limits import enforce_max_request_bytes


def _settings(max_request_bytes: int) -> Settings:
    return Settings(
        _env_file=None,
        app_name="limits test",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        max_request_bytes=max_request_bytes,
    )


def test_enforce_allows_under_limit() -> None:
    enforce_max_request_bytes(_settings(max_request_bytes=1024), observed_bytes=512)
    enforce_max_request_bytes(_settings(max_request_bytes=1024), observed_bytes=1024)


def test_enforce_raises_above_limit() -> None:
    settings = _settings(max_request_bytes=1024)
    with pytest.raises(RequestTooLargeError) as exc_info:
        enforce_max_request_bytes(settings, observed_bytes=2048)
    assert exc_info.value.code == "request_too_large"
    assert exc_info.value.status_code == 413
    assert exc_info.value.details == {"observed_bytes": 2048, "limit_bytes": 1024}
