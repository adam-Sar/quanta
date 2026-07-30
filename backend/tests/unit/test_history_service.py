"""Unit tests for the Task 6 HistoryService against in-memory SQLite."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models.dataset import Dataset, DatasetColumn, DatasetVersion
from app.db.models.history_comparison import HistoryComparison
from app.db.models.profile import ColumnProfile, DatasetProfile
from app.db.models.quality_score import QualityScore
from app.db.repositories.history_comparisons import HistoryComparisonRepository
from app.history.exceptions import SameVersionComparisonError, VersionNotFoundError
from app.history.service import HistoryService
from app.scoring.types import QualityGrade


def _create_sqlite_engine() -> tuple[Engine, sessionmaker[Session]]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    engine, factory = _create_sqlite_engine()
    yield factory
    engine.dispose()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        app_name="History Service Tests",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
        profile_null_threshold=0.5,
    )


@pytest.fixture
def session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    sess = session_factory()
    try:
        yield sess
    finally:
        sess.close()


def _seed_dataset_with_two_versions(session: Session) -> tuple[UUID, UUID, UUID]:
    dataset = Dataset(name="people", description=None)
    session.add(dataset)
    session.flush()
    base_version = DatasetVersion(
        dataset_id=dataset.id,
        version_number=1,
        format="csv",
        original_filename="people_v1.csv",
        media_type="text/csv",
        storage_key="datasets/people_v1.csv",
        content_sha256="0" * 64,
        size_bytes=1024,
        row_count=10,
        column_count=2,
    )
    target_version = DatasetVersion(
        dataset_id=dataset.id,
        version_number=2,
        format="csv",
        original_filename="people_v2.csv",
        media_type="text/csv",
        storage_key="datasets/people_v2.csv",
        content_sha256="0" * 64,
        size_bytes=1024,
        row_count=12,
        column_count=3,
    )
    session.add_all([base_version, target_version])
    session.flush()
    for column in (
        DatasetColumn(
            dataset_version_id=base_version.id,
            name="id",
            ordinal_position=1,
            physical_type="Int64",
            logical_type="integer",
            nullable=None,
        ),
        DatasetColumn(
            dataset_version_id=base_version.id,
            name="name",
            ordinal_position=2,
            physical_type="String",
            logical_type="string",
            nullable=None,
        ),
    ):
        session.add(column)
    for column in (
        DatasetColumn(
            dataset_version_id=target_version.id,
            name="id",
            ordinal_position=1,
            physical_type="Int64",
            logical_type="integer",
            nullable=None,
        ),
        DatasetColumn(
            dataset_version_id=target_version.id,
            name="name",
            ordinal_position=2,
            physical_type="String",
            logical_type="string",
            nullable=None,
        ),
        DatasetColumn(
            dataset_version_id=target_version.id,
            name="email",
            ordinal_position=3,
            physical_type="String",
            logical_type="string",
            nullable=None,
        ),
    ):
        session.add(column)
    session.commit()
    return dataset.id, base_version.id, target_version.id


def _seed_profile_with_score(
    session: Session,
    *,
    dataset_id: UUID,
    version_id: UUID,
    score: float,
    grade: QualityGrade,
) -> UUID:
    profile = DatasetProfile(
        dataset_id=dataset_id,
        dataset_version_id=version_id,
        sample_size=10,
        sampled="full",
        duration_ms=1,
    )
    session.add(profile)
    session.flush()
    column_metrics = {
        "physical_type": "Int64",
        "sample_size": 10,
        "non_null_count": 10,
        "null_count": 0,
        "null_rate": 0.0,
        "distinct_count": 10,
        "distinct_rate": 1.0,
        "top_values": [],
        "numeric": {
            "min": 1.0,
            "max": 100.0,
            "mean": 50.0,
            "median": 50.0,
            "std": 10.0,
            "sum": 500.0,
        },
        "temporal": {"min": None, "max": None},
        "string_length": {"min": None, "max": None, "mean": None},
    }
    session.add(
        ColumnProfile(
            dataset_profile_id=profile.id,
            name="id",
            ordinal_position=1,
            metrics=column_metrics,
        )
    )
    score_row = QualityScore(
        dataset_id=dataset_id,
        dataset_version_id=version_id,
        profile_id=profile.id,
        finding_count=0,
        score=score,
        grade=grade.value,
        formula_version="task5-1.0",
        components={"per_finding": []},
    )
    session.add(score_row)
    session.commit()
    return profile.id


@pytest.fixture
def history_service(session: Session, settings: Settings) -> HistoryService:
    return HistoryService(
        session=session,
        repository=HistoryComparisonRepository(session),
        settings=settings,
    )


def test_compare_versions_persists_immutable_row(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, base_id, target_id = _seed_dataset_with_two_versions(session)
    _seed_profile_with_score(
        session,
        dataset_id=dataset_id,
        version_id=base_id,
        score=80.0,
        grade=QualityGrade.B,
    )
    _seed_profile_with_score(
        session,
        dataset_id=dataset_id,
        version_id=target_id,
        score=70.0,
        grade=QualityGrade.C,
    )

    row = history_service.compare_versions(dataset_id, base_id, target_id)

    assert isinstance(row, HistoryComparison)
    assert row.dataset_id == dataset_id
    assert row.base_version_id == base_id
    assert row.target_version_id == target_id
    assert row.formula_version == "task6-1.0"
    schema = row.schema_diff
    assert schema["added"] == ["email"]
    assert schema["removed"] == []
    assert schema["type_changes"] == []
    score = row.score_drift
    assert score["base_score"] == pytest.approx(80.0)
    assert score["target_score"] == pytest.approx(70.0)
    assert score["delta"] == pytest.approx(-10.0)
    assert score["grade_changed"] is True
    again = history_service.compare_versions(dataset_id, base_id, target_id)
    assert session.query(HistoryComparison).count() == 2
    assert again.id != row.id


def test_compare_versions_rejects_same_version(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, _, version_id = _seed_dataset_with_two_versions(session)
    with pytest.raises(SameVersionComparisonError):
        history_service.compare_versions(dataset_id, version_id, version_id)


def test_compare_versions_raises_when_version_misses_dataset(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, base_id, _ = _seed_dataset_with_two_versions(session)
    with pytest.raises(VersionNotFoundError):
        history_service.compare_versions(dataset_id, base_id, uuid4())


def test_list_for_dataset_paginates(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, base_id, target_id = _seed_dataset_with_two_versions(session)
    for _ in range(3):
        history_service.compare_versions(dataset_id, base_id, target_id)

    items, total = history_service.list_for_dataset(dataset_id, offset=0, limit=2)
    assert total == 3
    assert len(items) == 2
    items_rest, total_rest = history_service.list_for_dataset(dataset_id, offset=2, limit=2)
    assert total_rest == 3
    assert len(items_rest) == 1


def test_lineage_returns_ordered_edges(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_with_two_versions(session)
    edges = history_service.lineage(dataset_id)
    assert [edge.from_version_number for edge in edges] == [1]
    assert [edge.to_version_number for edge in edges] == [2]


def test_get_comparison_returns_persisted_row(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, base_id, target_id = _seed_dataset_with_two_versions(session)
    row = history_service.compare_versions(dataset_id, base_id, target_id)
    fetched = history_service.get_comparison(row.id)
    assert fetched.id == row.id


def test_get_comparison_unknown_raises(history_service: HistoryService) -> None:
    with pytest.raises(VersionNotFoundError):
        history_service.get_comparison(uuid4())


def test_list_for_dataset_unknown_dataset_raises(
    history_service: HistoryService,
) -> None:
    with pytest.raises(VersionNotFoundError):
        history_service.list_for_dataset(uuid4(), offset=0, limit=10)


def test_score_drift_handles_missing_sides(
    history_service: HistoryService,
    session: Session,
) -> None:
    dataset_id, base_id, target_id = _seed_dataset_with_two_versions(session)
    _seed_profile_with_score(
        session,
        dataset_id=dataset_id,
        version_id=target_id,
        score=70.0,
        grade=QualityGrade.C,
    )
    row = history_service.compare_versions(dataset_id, base_id, target_id)
    assert row.score_drift["base_score"] is None
    assert row.score_drift["target_score"] == pytest.approx(70.0)
    assert row.score_drift["delta"] is None
