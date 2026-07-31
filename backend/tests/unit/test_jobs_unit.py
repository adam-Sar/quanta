"""Unit tests for the Task 10 durable analysis jobs runner and service."""

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
from app.db.models.validation import Validation  # noqa: F401
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.history_comparisons import HistoryComparisonRepository
from app.db.repositories.jobs import JobRepository
from app.db.repositories.profiles import ProfileRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.db.repositories.validations import ValidationRepository
from app.detection.service import DetectionService
from app.detection.types import FindingKind, FindingSeverity
from app.history.service import HistoryService
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.jobs.exceptions import JobNotFoundError
from app.jobs.runner import JobOutcome, run_job
from app.jobs.service import JobService
from app.jobs.types import JOB_FORMULA_VERSION, JobKind, JobRequest, JobStatus
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
from app.recommendations.service import RecommendationService
from app.scoring.service import ScoringService
from app.scoring.types import QualityGrade
from app.services.dataset_service import DatasetService
from app.services.exceptions import DatasetNotFoundError
from app.storage.files import LocalFileStorage
from app.validation.service import ValidationService


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
        app_name="Jobs Service Tests",
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


def _seed_dataset(
    session: Session,
    settings: Settings,
    storage: LocalFileStorage,
    *,
    with_profile: bool = True,
    with_findings: bool = True,
    with_score: bool = True,
) -> tuple[UUID, UUID | None, UUID | None]:
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
    profile_id: UUID | None = None
    if with_profile:
        profile = DatasetProfile(
            dataset_id=dataset.id,
            dataset_version_id=version.id,
            sample_size=2,
            sampled="full",
            duration_ms=1,
        )
        session.add(profile)
        session.flush()
        profile_id = profile.id
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
        if with_findings:
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
        if with_score:
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
    return dataset.id, version.id, profile_id


def _build_services(
    session: Session, settings: Settings
) -> tuple[
    ProfilingService,
    DetectionService,
    ScoringService,
    HistoryService,
    RecommendationService,
    ValidationService,
]:
    storage = LocalFileStorage(settings.storage_path)
    profiler = DatasetProfiler(
        sample_size=settings.profile_default_sample_rows,
        csv_infer_length=settings.csv_infer_schema_length,
        top_values_limit=settings.profile_top_values_limit,
    )
    profiling_service = ProfilingService(
        session=session,
        repository=ProfileRepository(session),
        storage=storage,
        profiler=profiler,
        settings=settings,
    )
    detection_service = DetectionService(
        session=session,
        repository=FindingRepository(session),
        profile_repository=ProfileRepository(session),
        settings=settings,
    )
    scoring_service = ScoringService(
        session=session,
        repository=QualityScoreRepository(session),
        finding_repository=FindingRepository(session),
        settings=settings,
    )
    history_service = HistoryService(
        session=session,
        repository=HistoryComparisonRepository(session),
        settings=settings,
    )
    recommendation_service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    recommendation_inner_service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    validation_service = ValidationService(
        session=session,
        repository=ValidationRepository(session),
        recommendation_repository=RecommendationRepository(session),
        recommendation_service=recommendation_inner_service,
        storage=storage,
        settings=settings,
    )
    return (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    )


def _build_job_service(
    session: Session, settings: Settings
) -> JobService:
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    return JobService(
        session=session,
        repository=JobRepository(session),
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )


# ----------------------------------------------------------------------
# Runner — direct invocation tests
# ----------------------------------------------------------------------


def test_run_job_profile_kind_returns_succeeded(session: Session, settings: Settings) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage, with_profile=False)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.PROFILE,
        dataset_id=dataset_id,
        profile_id=None,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert isinstance(outcome, JobOutcome)
    assert outcome.status is JobStatus.SUCCEEDED
    assert "profile_id" in outcome.result
    assert outcome.profile_id is not None


def test_run_job_detect_kind_returns_succeeded(session: Session, settings: Settings) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, profile_id = _seed_dataset(session, settings, storage)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.DETECT,
        dataset_id=dataset_id,
        profile_id=profile_id,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.SUCCEEDED
    assert outcome.result["finding_count"] == 1


def test_run_job_score_kind_returns_succeeded(session: Session, settings: Settings) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, profile_id = _seed_dataset(session, settings, storage)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.SCORE,
        dataset_id=dataset_id,
        profile_id=profile_id,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.SUCCEEDED
    assert isinstance(outcome.result["score"], float)
    assert 0.0 <= outcome.result["score"] <= 100.0
    assert outcome.result["grade"] in {"A", "B", "C", "D", "F"}
    assert outcome.result["finding_count"] >= 1


def test_run_job_recommendations_kind_returns_succeeded(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, profile_id = _seed_dataset(session, settings, storage)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.RECOMMENDATIONS,
        dataset_id=dataset_id,
        profile_id=profile_id,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.SUCCEEDED
    assert outcome.result["count"] == 1


def test_run_job_validations_kind_returns_succeeded(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, profile_id = _seed_dataset(session, settings, storage)
    recommendation_service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    rows = recommendation_service.recommend(dataset_id)
    recommendation_id = rows[0].id
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        _,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.VALIDATIONS,
        dataset_id=dataset_id,
        profile_id=profile_id,
        parameters={"recommendation_id": str(recommendation_id)},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.SUCCEEDED
    assert outcome.result["recommendation_id"] == str(recommendation_id)


def test_run_job_validations_kind_missing_recommendation_id_raises(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, profile_id = _seed_dataset(session, settings, storage)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.VALIDATIONS,
        dataset_id=dataset_id,
        profile_id=profile_id,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.FAILED
    assert outcome.error["code"] == "invalid_job_state"


def test_run_job_history_kind_requires_version_ids(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.HISTORY,
        dataset_id=dataset_id,
        profile_id=None,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.FAILED
    assert outcome.error["code"] == "invalid_job_state"


def test_run_job_unknown_dataset_returns_failed(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    _seed_dataset(session, settings, storage)
    (
        profiling_service,
        detection_service,
        scoring_service,
        history_service,
        recommendation_service,
        validation_service,
    ) = _build_services(session, settings)
    outcome = run_job(
        JobKind.PROFILE,
        dataset_id=uuid4(),
        profile_id=None,
        parameters={},
        profiling_service=profiling_service,
        detection_service=detection_service,
        scoring_service=scoring_service,
        history_service=history_service,
        recommendation_service=recommendation_service,
        validation_service=validation_service,
    )
    assert outcome.status is JobStatus.FAILED
    assert outcome.error["code"] == "dataset_not_found"


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


def test_job_service_run_profile_persists_succeeded_row(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage, with_profile=False)
    service = _build_job_service(session, settings)
    row = service.run(
        JobRequest(dataset_id=dataset_id, kind=JobKind.PROFILE)
    )
    assert row.status == JobStatus.SUCCEEDED.value
    assert row.kind == JobKind.PROFILE.value
    assert row.formula_version == JOB_FORMULA_VERSION
    assert row.dataset_id == dataset_id
    assert row.profile_id is not None
    assert row.started_at is not None
    assert row.completed_at is not None
    assert row.result["profile_id"] == str(row.profile_id)


def test_job_service_run_recommendations_persists_succeeded_row(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage)
    service = _build_job_service(session, settings)
    row = service.run(
        JobRequest(dataset_id=dataset_id, kind=JobKind.RECOMMENDATIONS)
    )
    assert row.status == JobStatus.SUCCEEDED.value
    assert row.kind == JobKind.RECOMMENDATIONS.value
    assert row.result["count"] == 1


def test_job_service_run_validations_persists_succeeded_row(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage)
    recommendation_service = RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )
    rows = recommendation_service.recommend(dataset_id)
    recommendation_id = rows[0].id
    service = _build_job_service(session, settings)
    row = service.run(
        JobRequest(
            dataset_id=dataset_id,
            kind=JobKind.VALIDATIONS,
            parameters={"recommendation_id": str(recommendation_id)},
        )
    )
    assert row.status == JobStatus.SUCCEEDED.value
    assert row.result["recommendation_id"] == str(recommendation_id)


def test_job_service_run_missing_dataset_raises(
    session: Session, settings: Settings
) -> None:
    service = _build_job_service(session, settings)
    with pytest.raises(DatasetNotFoundError):
        service.run(
            JobRequest(dataset_id=uuid4(), kind=JobKind.PROFILE)
        )


def test_job_service_run_missing_recommendation_marks_job_failed(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage)
    service = _build_job_service(session, settings)
    row = service.run(
        JobRequest(
            dataset_id=dataset_id,
            kind=JobKind.VALIDATIONS,
            parameters={"recommendation_id": str(uuid4())},
        )
    )
    assert row.status == JobStatus.FAILED.value
    assert row.error["code"] in {"validation_not_found", "invalid_validation_state"}


def test_job_service_run_missing_profile_marks_job_failed(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage, with_profile=False)
    service = _build_job_service(session, settings)
    row = service.run(
        JobRequest(dataset_id=dataset_id, kind=JobKind.SCORE)
    )
    assert row.status == JobStatus.FAILED.value


def test_job_service_get_unknown_raises(session: Session, settings: Settings) -> None:
    service = _build_job_service(session, settings)
    with pytest.raises(JobNotFoundError):
        service.get_job(uuid4())


def test_job_service_get_returns_persisted_row(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage)
    service = _build_job_service(session, settings)
    row = service.run(
        JobRequest(dataset_id=dataset_id, kind=JobKind.RECOMMENDATIONS)
    )
    fetched = service.get_job(row.id)
    assert fetched.id == row.id


def test_job_service_list_for_dataset_returns_paginated_rows(
    session: Session, settings: Settings
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _, _ = _seed_dataset(session, settings, storage)
    service = _build_job_service(session, settings)
    service.run(JobRequest(dataset_id=dataset_id, kind=JobKind.RECOMMENDATIONS))
    service.run(JobRequest(dataset_id=dataset_id, kind=JobKind.PROFILE))
    items, total = service.list_for_dataset(dataset_id, offset=0, limit=10)
    assert total == 2
    assert len(items) == 2


def test_job_service_list_unknown_dataset_raises(
    session: Session, settings: Settings
) -> None:
    service = _build_job_service(session, settings)
    with pytest.raises(DatasetNotFoundError):
        service.list_for_dataset(uuid4(), offset=0, limit=10)


def test_job_formula_version_is_pinned() -> None:
    assert JOB_FORMULA_VERSION == "task10-1.0"


def test_job_kind_values_are_stable() -> None:
    assert JobKind.PROFILE.value == "profile"
    assert JobKind.DETECT.value == "detect"
    assert JobKind.SCORE.value == "score"
    assert JobKind.HISTORY.value == "history"
    assert JobKind.RECOMMENDATIONS.value == "recommendations"
    assert JobKind.VALIDATIONS.value == "validations"


def test_job_status_values_are_stable() -> None:
    assert JobStatus.PENDING.value == "pending"
    assert JobStatus.RUNNING.value == "running"
    assert JobStatus.SUCCEEDED.value == "succeeded"
    assert JobStatus.FAILED.value == "failed"
