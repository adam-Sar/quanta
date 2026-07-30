"""Unit tests for the Task 8 recommendations rule engine and service."""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi import UploadFile
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models.ai_interpretation import AIInterpretation  # noqa: F401
from app.db.models.dataset import Dataset, DatasetVersion
from app.db.models.finding import Finding
from app.db.models.history_comparison import HistoryComparison  # noqa: F401
from app.db.models.profile import ColumnProfile, DatasetProfile
from app.db.models.quality_score import QualityScore
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.detection.types import Finding as DomainFinding
from app.detection.types import FindingKind, FindingSeverity
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.recommendations.exceptions import RecommendationsNotAvailableError
from app.recommendations.formula import (
    MISSING_DROP_SEVERITIES,
    MISSING_DROP_VALUE_THRESHOLD,
    OUTLIER_CAP_SEVERITIES,
    SEVERITY_WEIGHTS,
    build_recommendation,
    compute_recommendation_run,
)
from app.recommendations.service import RecommendationService
from app.recommendations.types import (
    RECOMMENDATION_FORMULA_VERSION,
    OperationKind,
    RecommendationKind,
    RecommendationSeverity,
)
from app.scoring.types import QualityGrade
from app.services.dataset_service import DatasetService
from app.services.exceptions import DatasetNotFoundError
from app.storage.files import LocalFileStorage


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
        app_name="Recommendation Service Tests",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
        recommendation_max_per_run=50,
    )


@pytest.fixture
def session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    sess = session_factory()
    try:
        yield sess
    finally:
        sess.close()


def _seed_dataset_with_findings(
    session: Session,
    settings: Settings,
    storage: LocalFileStorage,
    *,
    include_score: bool = False,
) -> tuple[UUID, UUID]:
    service = DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=storage,
        validator=DatasetFileValidator(),
        readers=MetadataReaderRegistry(
            {
                DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
                DatasetFormat.PARQUET: ParquetMetadataReader(),
            }
        ),
        settings=settings,
    )
    upload = UploadFile(  # type: ignore[arg-type]
        file=io.BytesIO(b"id,name\n1,alice\n2,bob\n"),
        filename="people.csv",
    )
    service.ingest(upload=upload, name="people", description=None)
    session.commit()
    dataset = session.query(Dataset).one()
    version = session.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset.id).one()
    profile = DatasetProfile(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        sample_size=2,
        sampled="full",
        duration_ms=1,
    )
    session.add(profile)
    session.flush()
    column = next(c for c in version.columns if c.name == "id")
    session.add(
        ColumnProfile(
            dataset_profile_id=profile.id,
            name=column.name,
            ordinal_position=column.ordinal_position,
            metrics={
                "physical_type": column.physical_type,
                "sample_size": 2,
                "non_null_count": 2,
                "null_count": 0,
                "null_rate": 0.0,
                "distinct_count": 2,
                "distinct_rate": 1.0,
                "top_values": [],
                "numeric": {
                    "min": 1.0,
                    "max": 2.0,
                    "mean": 1.5,
                    "median": 1.5,
                    "std": 0.5,
                    "sum": 3.0,
                },
                "temporal": {"min": None, "max": None},
                "string_length": {"min": None, "max": None, "mean": None},
            },
        )
    )
    session.add(
        Finding(
            dataset_id=dataset.id,
            dataset_version_id=version.id,
            profile_id=profile.id,
            kind=FindingKind.MISSINGNESS.value,
            severity=FindingSeverity.HIGH.value,
            column_name=column.name,
            metric="null_rate",
            value=0.85,
            threshold=0.5,
            description="high null rate",
            details={},
        )
    )
    if include_score:
        session.add(
            QualityScore(
                dataset_id=dataset.id,
                dataset_version_id=version.id,
                profile_id=profile.id,
                finding_count=1,
                score=72.5,
                grade=QualityGrade.B,
                formula_version="task5-1.0",
                components={"overall_penalty_total": 0.25},
            )
        )
    session.commit()
    return dataset.id, profile.id


@pytest.fixture
def recommendation_service(session: Session, settings: Settings) -> RecommendationService:
    return RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )


# ----------------------------------------------------------------------
# Rule engine
# ----------------------------------------------------------------------


def _finding(**overrides: object) -> DomainFinding:
    base: dict[str, object] = {
        "kind": FindingKind.MISSINGNESS,
        "severity": FindingSeverity.MEDIUM,
        "column_name": "id",
        "metric": "null_rate",
        "value": 0.55,
        "threshold": 0.5,
        "description": "null rate above threshold",
        "details": {},
        "id": uuid4(),
    }
    base.update(overrides)
    return DomainFinding(**base)  # type: ignore[arg-type]


def test_build_recommendation_drops_sparse_column() -> None:
    # Use value=1.0 so detection_confidence and data_error_confidence
    # both saturate at 1.0 and priority equals the severity weight.
    finding = _finding(value=1.0, severity=FindingSeverity.HIGH)
    rec = build_recommendation(finding)
    assert rec.kind is RecommendationKind.MISSINGNESS_TREATMENT
    assert rec.severity is RecommendationSeverity.HIGH
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.DROP_COLUMN
    assert rec.operation.preview_only is True
    assert rec.affected_columns == ("id",)
    assert rec.supporting_finding_ids == (finding.id,)
    assert rec.priority == SEVERITY_WEIGHTS[RecommendationSeverity.HIGH]
    assert rec.confidence == pytest.approx(1.0)


def test_build_recommendation_imputes_when_medium() -> None:
    finding = _finding(value=0.6, severity=FindingSeverity.MEDIUM)
    rec = build_recommendation(finding)
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.IMPUTE_MISSING
    assert rec.operation.params["strategy"] in {"mean", "mode"}
    assert rec.severity is RecommendationSeverity.MEDIUM


def test_build_recommendation_low_severity_review() -> None:
    finding = _finding(value=0.51, severity=FindingSeverity.LOW)
    rec = build_recommendation(finding)
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.REVIEW


def test_build_recommendation_duplicate_removal() -> None:
    finding = _finding(kind=FindingKind.DUPLICATES, severity=FindingSeverity.HIGH)
    rec = build_recommendation(finding)
    assert rec.kind is RecommendationKind.DUPLICATE_REMOVAL
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.DROP_DUPLICATES


def test_build_recommendation_invalid_values_cast() -> None:
    finding = _finding(kind=FindingKind.INVALID_VALUES, severity=FindingSeverity.MEDIUM)
    rec = build_recommendation(finding)
    assert rec.kind is RecommendationKind.DATA_QUALITY_FIX
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.CAST_TYPE


def test_build_recommendation_outlier_high_caps() -> None:
    finding = _finding(
        kind=FindingKind.OUTLIER,
        severity=FindingSeverity.HIGH,
        threshold=3.0,
    )
    rec = build_recommendation(finding)
    assert rec.kind is RecommendationKind.OUTLIER_TREATMENT
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.CAP_OUTLIERS
    assert rec.operation.params["threshold"] == pytest.approx(3.0)


def test_build_recommendation_outlier_low_reviews() -> None:
    finding = _finding(
        kind=FindingKind.OUTLIER,
        severity=FindingSeverity.MEDIUM,
        threshold=2.0,
    )
    rec = build_recommendation(finding)
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.REVIEW


def test_build_recommendation_cardinality_groups_rare() -> None:
    finding = _finding(kind=FindingKind.CARDINALITY, severity=FindingSeverity.MEDIUM)
    rec = build_recommendation(finding)
    assert rec.kind is RecommendationKind.CARDINALITY_REDUCTION
    assert rec.operation is not None
    assert rec.operation.kind is OperationKind.GROUP_RARE_CATEGORICAL


def test_compute_recommendation_run_aggregates_by_kind_and_severity() -> None:
    findings = (
        _finding(kind=FindingKind.MISSINGNESS, severity=FindingSeverity.HIGH),
        _finding(kind=FindingKind.DUPLICATES, severity=FindingSeverity.MEDIUM),
        _finding(kind=FindingKind.OUTLIER, severity=FindingSeverity.HIGH),
    )
    run = compute_recommendation_run(
        dataset_id=uuid4(),
        profile_id=uuid4(),
        findings=findings,
    )
    assert run.recommendation_count == 3
    assert run.by_kind["missingness_treatment"] == 1
    assert run.by_kind["duplicate_removal"] == 1
    assert run.by_kind["outlier_treatment"] == 1
    assert run.by_severity["high"] == 2
    assert run.by_severity["medium"] == 1
    assert run.formula_version == RECOMMENDATION_FORMULA_VERSION


def test_compute_recommendation_run_caps_trimmed_by_priority() -> None:
    findings = tuple(
        _finding(
            kind=FindingKind.INVALID_VALUES,
            severity=FindingSeverity.HIGH,
            threshold=0.6 + 0.001 * index,
        )
        for index in range(5)
    )
    run = compute_recommendation_run(
        dataset_id=uuid4(),
        profile_id=uuid4(),
        findings=findings,
        max_recommendations=2,
    )
    assert run.recommendation_count == 2


def test_recommendation_severities_match_task_four() -> None:
    assert frozenset(
        {RecommendationSeverity.CRITICAL, RecommendationSeverity.HIGH}
    ) == MISSING_DROP_SEVERITIES
    assert OUTLIER_CAP_SEVERITIES == MISSING_DROP_SEVERITIES
    assert MISSING_DROP_VALUE_THRESHOLD == 0.80


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


def test_recommendation_service_persists_rows(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, profile_id = _seed_dataset_with_findings(
        session, settings, storage, include_score=True
    )
    service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    rows = service.recommend(dataset_id)
    assert len(rows) == 1
    row = rows[0]
    assert row.dataset_id == dataset_id
    assert row.profile_id == profile_id
    assert row.formula_version == RECOMMENDATION_FORMULA_VERSION
    assert row.kind == "missingness_treatment"
    assert row.severity == "high"
    assert row.preview_only is True
    assert row.operation_kind == "drop_column"
    assert row.affected_columns == ["id"]
    assert isinstance(row.components, dict)
    assert row.components["score"]["score"] == pytest.approx(72.5)
    assert row.components["interpretation_id"] is None


def test_recommendation_service_unknown_dataset_raises(
    session: Session,
    settings: Settings,
) -> None:
    service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    with pytest.raises(DatasetNotFoundError):
        service.recommend(uuid4())


def test_recommendation_service_without_findings_raises(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    service = DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=storage,
        validator=DatasetFileValidator(),
        readers=MetadataReaderRegistry(
            {
                DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
                DatasetFormat.PARQUET: ParquetMetadataReader(),
            }
        ),
        settings=settings,
    )
    upload = UploadFile(  # type: ignore[arg-type]
        file=io.BytesIO(b"id,name\n1,alice\n2,bob\n"),
        filename="people.csv",
    )
    service.ingest(upload=upload, name="people", description=None)
    session.commit()
    dataset = session.query(Dataset).one()
    version = session.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset.id).one()
    profile = DatasetProfile(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        sample_size=2,
        sampled="full",
        duration_ms=1,
    )
    session.add(profile)
    session.commit()
    reasoning = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    with pytest.raises(RecommendationsNotAvailableError):
        reasoning.recommend(dataset.id)


def test_recommendation_service_get_unknown_raises(
    session: Session,
    settings: Settings,
) -> None:
    from app.recommendations.exceptions import RecommendationNotFoundError

    service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    with pytest.raises(RecommendationNotFoundError):
        service.get_recommendation(uuid4())


def test_recommendation_service_list_for_dataset(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _ = _seed_dataset_with_findings(session, settings, storage)
    service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    service.recommend(dataset_id)
    items, total = service.list_for_dataset(dataset_id, offset=0, limit=10)
    assert total == 1
    assert len(items) == 1


def test_recommendation_service_get_recommendation_returns_row(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _ = _seed_dataset_with_findings(session, settings, storage)
    service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    rows = service.recommend(dataset_id)
    fetched = service.get_recommendation(rows[0].id)
    assert fetched.id == rows[0].id