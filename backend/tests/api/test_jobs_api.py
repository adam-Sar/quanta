"""API contract tests for the Task 10 durable analysis jobs endpoints.

The routes are small. We exercise the happy path (201 with a
succeeded row), the 404 paths for unknown datasets and unknown job
ids, and the OpenAPI operation ids.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies import (
    get_dataset_service,
    get_job_service,
    get_validation_service,
)
from app.db.base import Base
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.history_comparisons import HistoryComparisonRepository
from app.db.repositories.jobs import JobRepository
from app.db.repositories.profiles import ProfileRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.db.repositories.validations import ValidationRepository
from app.db.session import get_db
from app.detection.service import DetectionService
from app.history.service import HistoryService
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.jobs.service import JobService
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
from app.recommendations.service import RecommendationService
from app.scoring.service import ScoringService
from app.services.dataset_service import DatasetService
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
def jobs_environment(
    application: FastAPI,
) -> Iterator[None]:
    """Wire SQLite-backed dependencies for the jobs endpoints."""

    _, factory = _create_sqlite_engine()
    settings = application.state.settings
    storage = LocalFileStorage(settings.storage_path)

    def _db() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    def _dataset_service() -> DatasetService:
        session = factory()
        readers = MetadataReaderRegistry(
            {
                DatasetFormat.CSV: CsvMetadataReader(10_000),
                DatasetFormat.PARQUET: ParquetMetadataReader(),
            }
        )
        return DatasetService(
            session=session,
            repository=DatasetRepository(session),
            storage=storage,
            validator=DatasetFileValidator(),
            readers=readers,
            settings=settings,
        )

    def _profiling_service() -> ProfilingService:
        session = factory()
        profiler = DatasetProfiler(
            sample_size=settings.profile_default_sample_rows,
            csv_infer_length=settings.csv_infer_schema_length,
            top_values_limit=settings.profile_top_values_limit,
        )
        return ProfilingService(
            session=session,
            repository=ProfileRepository(session),
            storage=storage,
            profiler=profiler,
            settings=settings,
        )

    def _detection_service() -> DetectionService:
        session = factory()
        return DetectionService(
            session=session,
            repository=FindingRepository(session),
            profile_repository=ProfileRepository(session),
            settings=settings,
        )

    def _scoring_service() -> ScoringService:
        session = factory()
        return ScoringService(
            session=session,
            repository=QualityScoreRepository(session),
            finding_repository=FindingRepository(session),
            settings=settings,
        )

    def _history_service() -> HistoryService:
        session = factory()
        return HistoryService(
            session=session,
            repository=HistoryComparisonRepository(session),
            settings=settings,
        )

    def _recommendation_service() -> RecommendationService:
        session = factory()
        return RecommendationService(
            session=session,
            repository=RecommendationRepository(session),
            finding_repository=FindingRepository(session),
            score_repository=QualityScoreRepository(session),
            interpretation_repository=AIInterpretationRepository(session),
            settings=settings,
        )

    def _validation_service() -> ValidationService:
        session = factory()
        recommendation_service = _recommendation_service()
        return ValidationService(
            session=session,
            repository=ValidationRepository(session),
            recommendation_repository=RecommendationRepository(session),
            recommendation_service=recommendation_service,
            storage=storage,
            settings=settings,
        )

    def _job_service() -> JobService:
        session = factory()
        return JobService(
            session=session,
            repository=JobRepository(session),
            profiling_service=_profiling_service(),
            detection_service=_detection_service(),
            scoring_service=_scoring_service(),
            history_service=_history_service(),
            recommendation_service=_recommendation_service(),
            validation_service=_validation_service(),
        )

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _dataset_service
    application.dependency_overrides[get_validation_service] = _validation_service
    application.dependency_overrides[get_job_service] = _job_service
    yield
    application.dependency_overrides.clear()


def _create_dataset(client: TestClient) -> str:
    response = client.post(
        "/datasets",
        data={"name": "people"},
        files={
            "file": (
                "people.csv",
                io.BytesIO(b"id,name\n1,alice\n2,bob\n"),
                "text/csv",
            )
        },
    )
    assert response.status_code == 201, response.text
    return cast(str, response.json()["id"])


def test_jobs_endpoints_openapi_ids_present(client: TestClient) -> None:
    document = client.get("/openapi.json").json()
    paths = document["paths"]
    assert paths["/datasets/{dataset_id}/jobs"]["post"]["operationId"] == "create_dataset_job"
    assert paths["/datasets/{dataset_id}/jobs"]["get"]["operationId"] == "list_dataset_jobs"
    assert paths["/datasets/jobs/{job_id}"]["get"]["operationId"] == "get_dataset_job"


def test_post_job_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    jobs_environment: None,
) -> None:
    response = client.post(
        "/datasets/00000000-0000-0000-0000-000000000000/jobs",
        json={"kind": "profile"},
    )
    assert response.status_code == 404


def test_post_job_profile_kind_succeeds(
    application: FastAPI,
    client: TestClient,
    jobs_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.post(
        f"/datasets/{dataset_id}/jobs",
        json={"kind": "profile"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["dataset_id"] == dataset_id
    assert body["kind"] == "profile"
    assert body["status"] == "succeeded"
    assert "profile_id" in body["result"]


def test_get_job_unknown_id_returns_404(
    application: FastAPI,
    client: TestClient,
    jobs_environment: None,
) -> None:
    _create_dataset(client)
    response = client.get("/datasets/jobs/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_list_jobs_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    jobs_environment: None,
) -> None:
    response = client.get(
        "/datasets/00000000-0000-0000-0000-000000000000/jobs"
    )
    assert response.status_code == 404


def test_list_jobs_for_new_dataset_returns_empty(
    application: FastAPI,
    client: TestClient,
    jobs_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(f"/datasets/{dataset_id}/jobs")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["pagination"]["total_items"] == 0


def test_post_job_recommendations_kind_fails_without_findings(
    application: FastAPI,
    client: TestClient,
    jobs_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.post(
        f"/datasets/{dataset_id}/jobs",
        json={"kind": "recommendations"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "failed"
    assert body["error"]["code"] in {
        "recommendations_not_available",
        "dataset_not_profileable",
        "dataset_not_found",
        "internal_error",
    }
