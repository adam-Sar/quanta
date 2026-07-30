"""Unit tests for database metadata and request-scoped sessions."""

from typing import cast

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import session as session_module
from app.db.base import Base


class SessionDouble:
    def __init__(self) -> None:
        self.closed = False
        self.rolled_back = False
        self.executed_sql = ""

    def execute(self, statement: object) -> None:
        self.executed_sql = str(statement)

    def rollback(self) -> None:
        self.rolled_back = True

    def close(self) -> None:
        self.closed = True


def test_engine_uses_psycopg_and_configured_pool() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://test:test@localhost/quanta",
        database_pool_size=3,
        database_max_overflow=4,
    )

    engine = session_module.build_database_engine(settings)
    try:
        assert engine.url.drivername == "postgresql+psycopg"
        assert engine.pool.size() == 3  # type: ignore[attr-defined]
    finally:
        engine.dispose()


def test_session_dependency_closes_successful_session(monkeypatch: pytest.MonkeyPatch) -> None:
    session = SessionDouble()
    monkeypatch.setattr(session_module, "SessionLocal", lambda: cast(Session, session))
    dependency = session_module.get_db()

    yielded_session = next(dependency)
    assert yielded_session is cast(Session, session)
    dependency.close()

    assert session.closed is True
    assert session.rolled_back is False


def test_session_dependency_rolls_back_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    session = SessionDouble()
    monkeypatch.setattr(session_module, "SessionLocal", lambda: cast(Session, session))
    dependency = session_module.get_db()
    next(dependency)

    with pytest.raises(RuntimeError, match="service failed"):
        dependency.throw(RuntimeError("service failed"))

    assert session.rolled_back is True
    assert session.closed is True


def test_database_probe_is_minimal_select() -> None:
    session = SessionDouble()

    session_module.check_database(cast(Session, session))

    assert session.executed_sql == "SELECT 1"


def test_metadata_has_deterministic_constraint_names() -> None:
    assert Base.metadata.naming_convention["pk"] == "pk_%(table_name)s"
    foreign_key_convention = Base.metadata.naming_convention["fk"]
    assert isinstance(foreign_key_convention, str)
    assert foreign_key_convention.startswith("fk_%(table_name)s")
    assert "datasets" in Base.metadata.tables
    assert "dataset_versions" in Base.metadata.tables
    assert "dataset_columns" in Base.metadata.tables
