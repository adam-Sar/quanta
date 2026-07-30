"""Unit tests for the Task 5 ScoringService."""

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
from app.db.models.finding import Finding
from app.db.models.profile import DatasetProfile
from app.db.models.quality_score import QualityScore
from app.db.repositories.findings import FindingRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.detection.types import FindingKind, FindingSeverity
from app.scoring.exceptions import ScoringNotProfileableError
from app.scoring.service import ScoringService
from app.scoring.types import QualityGrade
from app.services.exceptions import DatasetNotFoundError


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
        app_name="Scoring Service Tests",
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


def _seed_dataset_and_profile(
    session: Session,
    *,
    finding_count: int = 0,
    column_count: int = 3,
) -> tuple[UUID, UUID, UUID]:
    """Insert a dataset, version, profile, and a configurable set of findings."""

    dataset = Dataset(name="people", description=None)
    session.add(dataset)
    session.flush()
    version = DatasetVersion(
        dataset_id=dataset.id,
        version_number=1,
        format="csv",
        original_filename="people.csv",
        media_type="text/csv",
        storage_key="datasets/people.csv",
        content_sha256="0" * 64,
        size_bytes=1024,
        row_count=10,
        column_count=column_count,
    )
    session.add(version)
    session.flush()
    for i in range(column_count):
        session.add(
            DatasetColumn(
                dataset_version_id=version.id,
                name=f"col_{i}",
                ordinal_position=i + 1,
                physical_type="Int64",
                logical_type="integer",
                nullable=None,
            )
        )
    profile = DatasetProfile(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        sample_size=10,
        sampled="full",
        duration_ms=1,
    )
    session.add(profile)
    session.flush()
    for i in range(finding_count):
        session.add(
            Finding(
                dataset_id=dataset.id,
                dataset_version_id=version.id,
                profile_id=profile.id,
                kind=FindingKind.MISSINGNESS.value,
                severity=FindingSeverity.MEDIUM.value,
                column_name=f"col_{i % max(column_count, 1)}",
                metric="null_rate",
                value=0.7,
                threshold=0.5,
                description=f"finding {i}",
                details={},
            )
        )
    session.commit()
    return dataset.id, version.id, profile.id


@pytest.fixture
def scoring_service(session: Session, settings: Settings) -> ScoringService:
    return ScoringService(
        session=session,
        repository=QualityScoreRepository(session),
        finding_repository=FindingRepository(session),
        settings=settings,
    )


def test_score_latest_persists_quality_score(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, profile_id = _seed_dataset_and_profile(session, finding_count=2)
    row = scoring_service.score_latest(dataset_id)

    assert isinstance(row, QualityScore)
    assert row.dataset_id == dataset_id
    assert row.profile_id == profile_id
    assert row.finding_count == 2
    assert 0.0 <= row.score <= 100.0
    assert row.formula_version
    assert row.components
    persisted = session.query(QualityScore).count()
    assert persisted == 1


def test_score_latest_unknown_dataset_raises_404(
    scoring_service: ScoringService,
) -> None:
    with pytest.raises(DatasetNotFoundError):
        scoring_service.score_latest(uuid4())


def test_score_latest_without_findings_raises_conflict(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=0)
    with pytest.raises(ScoringNotProfileableError):
        scoring_service.score_latest(dataset_id)


def test_score_latest_without_profile_raises_conflict(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    # Insert dataset/version but no profile, so no findings exist either.
    dataset = Dataset(name="empty")
    session.add(dataset)
    session.flush()
    session.add(
        DatasetVersion(
            dataset_id=dataset.id,
            version_number=1,
            format="csv",
            original_filename="empty.csv",
            media_type="text/csv",
            storage_key="datasets/empty.csv",
            content_sha256="0" * 64,
            size_bytes=0,
            row_count=0,
            column_count=0,
        )
    )
    session.commit()

    with pytest.raises(ScoringNotProfileableError):
        scoring_service.score_latest(dataset.id)


def test_get_latest_returns_most_recent_score(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=1)
    first = scoring_service.score_latest(dataset_id)
    second = scoring_service.score_latest(dataset_id)
    assert first.id != second.id

    latest = scoring_service.get_latest(dataset_id)
    assert latest is not None
    assert latest.id == second.id


def test_get_latest_unknown_dataset_raises_404(
    scoring_service: ScoringService,
) -> None:
    with pytest.raises(DatasetNotFoundError):
        scoring_service.get_latest(uuid4())


def test_get_for_version_returns_latest_score(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, version_id, _ = _seed_dataset_and_profile(session, finding_count=1)
    scoring_service.score_latest(dataset_id)
    row = scoring_service.get_for_version(dataset_id, version_id)
    assert row is not None
    assert row.dataset_version_id == version_id


def test_get_for_version_unknown_dataset_raises_404(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=1)
    scoring_service.score_latest(dataset_id)
    with pytest.raises(DatasetNotFoundError):
        scoring_service.get_for_version(dataset_id, uuid4())


def test_get_for_version_unknown_version_raises_404(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=1)
    scoring_service.score_latest(dataset_id)
    with pytest.raises(DatasetNotFoundError):
        scoring_service.get_for_version(dataset_id, uuid4())


def test_get_for_version_without_score_raises_conflict(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, version_id, _ = _seed_dataset_and_profile(session, finding_count=1)
    with pytest.raises(ScoringNotProfileableError):
        scoring_service.get_for_version(dataset_id, version_id)


def test_list_for_dataset_paginates(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=1)
    for _ in range(3):
        scoring_service.score_latest(dataset_id)

    items, total = scoring_service.list_for_dataset(dataset_id, offset=0, limit=2)
    assert total == 3
    assert len(items) == 2

    items_rest, total_rest = scoring_service.list_for_dataset(dataset_id, offset=2, limit=2)
    assert total_rest == 3
    assert len(items_rest) == 1


def test_list_for_dataset_unknown_dataset_raises_404(
    scoring_service: ScoringService,
) -> None:
    with pytest.raises(DatasetNotFoundError):
        scoring_service.list_for_dataset(uuid4(), offset=0, limit=10)


def test_components_persist_per_finding_breakdown(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=2)
    row = scoring_service.score_latest(dataset_id)
    components = dict(row.components)
    assert "per_finding" in components
    per_finding = components["per_finding"]
    assert len(per_finding) == 2
    for entry in per_finding:
        assert "detection_confidence" in entry
        assert "data_error_confidence" in entry
        assert "penalty" in entry
        assert 0.0 <= entry["detection_confidence"] <= 1.0
        assert 0.0 <= entry["data_error_confidence"] <= 1.0
        assert entry["penalty"] >= 0.0


def test_grade_is_documented_value(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, _ = _seed_dataset_and_profile(session, finding_count=1)
    row = scoring_service.score_latest(dataset_id)
    assert row.grade in {
        QualityGrade.A,
        QualityGrade.B,
        QualityGrade.C,
        QualityGrade.D,
        QualityGrade.F,
    }


def test_score_does_not_mutate_profile_or_findings(
    scoring_service: ScoringService,
    session: Session,
) -> None:
    dataset_id, _, profile_id = _seed_dataset_and_profile(session, finding_count=1)
    profile_before = session.get(DatasetProfile, profile_id)
    assert profile_before is not None
    findings_before = session.query(Finding).filter(Finding.profile_id == profile_id).all()
    scoring_service.score_latest(dataset_id)
    session.expire_all()
    profile_after = session.get(DatasetProfile, profile_id)
    findings_after = session.query(Finding).filter(Finding.profile_id == profile_id).all()
    assert profile_after is not None
    assert profile_before.created_at == profile_after.created_at
    assert len(findings_before) == len(findings_after) == 1
