"""Shared test fixtures for isolated FastAPI application instances."""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.middleware import reset_limiter
from app.core.metrics import RECORDER
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        app_name="Quanta Test API",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
    )


@pytest.fixture
def application(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture(autouse=True)
def _reset_process_state() -> Generator[None, None, None]:
    """Reset process-wide state (rate limiter + metrics recorder) per test.

    The Task 11 hardening moved the rate limiter and request metrics
    recorder to module-level singletons so the ``GET /metrics`` and
    rate-limit middleware can share state across the process. Without
    this fixture, earlier tests' usage would leak into later tests
    and surface as spurious 429s or inflated recent-observation
    counts. The autouse=True scope is intentional: every test in the
    suite must start with a clean rate-limit window and empty
    metrics buffer.
    """

    reset_limiter()
    RECORDER.reset()
    yield
    reset_limiter()
    RECORDER.reset()


@pytest.fixture
def client(application: FastAPI) -> Generator[TestClient, None, None]:
    with TestClient(application) as test_client:
        yield test_client
