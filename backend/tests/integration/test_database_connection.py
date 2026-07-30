"""Opt-in connectivity test for a real PostgreSQL instance."""

import os

import pytest
from sqlalchemy import text

from app.db.session import engine


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_DATABASE_TESTS") != "1",
    reason=(
        "Set RUN_DATABASE_TESTS=1 with DATABASE_URL pointing to a disposable PostgreSQL database"
    ),
)
def test_configured_postgresql_accepts_queries() -> None:
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT 1")) == 1
