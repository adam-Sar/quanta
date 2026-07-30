"""API tests for the deterministic scoring endpoints (Task 5)."""

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
    get_detection_service,
    get_profiling_service,
    get_scoring_service,
)
from app.db.base import Base
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.profiles import ProfileRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.session import get_db
from app.detection.service import DetectionService
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
from app.scoring.service import ScoringService
from app.services.dataset_service import DatasetService
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
def scoring_environment(application: FastAPI) -> Iterator[None]:
    """Wire SQLite-backed dependencies for the scoring service."""

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
            sample_size=10_000,
            csv_infer_length=10_000,
            top_values_limit=5,
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

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _dataset_service
    application.dependency_overrides[get_profiling_service] = _profiling_service
    application.dependency_overrides[get_detection_service] = _detection_service
    application.dependency_overrides[get_scoring_service] = _scoring_service
    yield
    application.dependency_overrides.clear()


def _create_dataset(
    client: TestClient,
    name: str = "people",
    csv: str = "id,name\n1,alice\n2,bob\n",
) -> str:
    response = client.post(
        "/datasets",
        data={"name": name},
        files={
            "file": (
                "people.csv",
                io.BytesIO(csv.encode()),
                "text/csv",
            )
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    return cast(str, payload["id"])


def _profile_and_detect(client: TestClient, dataset_id: str) -> str:
    profile_response = client.post(f"/datasets/{dataset_id}/profile")
    assert profile_response.status_code == 201, profile_response.text
    detect_response = client.post(f"/datasets/{dataset_id}/detections")
    assert detect_response.status_code == 201, detect_response.text
    return cast(str, detect_response.json()["profile_id"])


def test_post_score_creates_run_and_returns_201(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    _profile_and_detect(client, dataset_id)

    response = client.post(f"/datasets/{dataset_id}/scores")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["dataset_id"] == dataset_id
    assert body["finding_count"] >= 0
    assert 0.0 <= body["score"] <= 100.0
    assert body["grade"] in {"A", "B", "C", "D", "F"}
    assert body["formula_version"]
    components = body["components"]
    assert "by_kind" in components
    assert "by_severity" in components
    assert "by_column" in components
    assert "overall_penalty_total" in components
    assert "overall_penalty_normalized" in components
    assert "column_count" in components
    assert "per_finding" in components
    for entry in components["per_finding"]:
        assert 0.0 <= entry["detection_confidence"] <= 1.0
        assert 0.0 <= entry["data_error_confidence"] <= 1.0


def test_get_latest_score_returns_persisted_run(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    _profile_and_detect(client, dataset_id)
    post_response = client.post(f"/datasets/{dataset_id}/scores")
    score_id = post_response.json()["score_id"]

    response = client.get(f"/datasets/{dataset_id}/score")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["score_id"] == score_id


def test_get_version_score_returns_persisted_run(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    create = client.get(f"/datasets/{dataset_id}").json()
    version_id = create["current_version"]["id"]
    _profile_and_detect(client, dataset_id)
    client.post(f"/datasets/{dataset_id}/scores")

    response = client.get(f"/datasets/{dataset_id}/versions/{version_id}/score")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dataset_version_id"] == version_id


def test_get_score_for_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/score")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_get_score_without_runs_returns_409(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(f"/datasets/{dataset_id}/score")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "scoring_not_scoreable"


def test_get_version_score_unknown_version_returns_404(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/versions/00000000-0000-0000-0000-000000000000/score"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_post_score_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    response = client.post("/datasets/00000000-0000-0000-0000-000000000000/scores")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_post_score_without_detection_returns_409(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.post(f"/datasets/{dataset_id}/scores")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "scoring_not_scoreable"


def test_list_scores_endpoint_paginates(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    _profile_and_detect(client, dataset_id)
    for _ in range(3):
        response = client.post(f"/datasets/{dataset_id}/scores")
        assert response.status_code == 201

    response = client.get(f"/datasets/{dataset_id}/scores?page=1&page_size=2")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pagination"] == {
        "page": 1,
        "page_size": 2,
        "total_items": 3,
        "total_pages": 2,
    }
    assert len(body["items"]) == 2


def test_list_scores_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/scores")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_score_persists_immutable_history(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    _profile_and_detect(client, dataset_id)
    first = client.post(f"/datasets/{dataset_id}/scores").json()
    second = client.post(f"/datasets/{dataset_id}/scores").json()

    assert first["score_id"] != second["score_id"]

    listed = client.get(f"/datasets/{dataset_id}/scores?page=1&page_size=10").json()
    ids = [item["score_id"] for item in listed["items"]]
    assert first["score_id"] in ids
    assert second["score_id"] in ids
    assert len(ids) == 2


def test_score_grade_is_one_of_documented_values(
    application: FastAPI,
    client: TestClient,
    scoring_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    _profile_and_detect(client, dataset_id)
    response = client.post(f"/datasets/{dataset_id}/scores")
    body = response.json()
    assert body["grade"] in {"A", "B", "C", "D", "F"}
