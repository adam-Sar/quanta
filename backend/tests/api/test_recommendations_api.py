"""API tests for the Task 8 deterministic recommendations endpoints."""

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
    get_recommendation_service,
)
from app.db.base import Base
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.db.session import get_db
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.recommendations.service import RecommendationService
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
def recommendations_environment(application: FastAPI) -> Iterator[None]:
    """Wire SQLite-backed dependencies for the recommendations endpoints."""

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

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _dataset_service
    application.dependency_overrides[get_recommendation_service] = _recommendation_service
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
    return cast(str, response.json()["id"])


def test_post_recommendations_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    recommendations_environment: None,
) -> None:
    response = client.post("/datasets/00000000-0000-0000-0000-000000000000/recommendations")
    assert response.status_code == 404


def test_post_recommendations_returns_409_without_findings(
    application: FastAPI,
    client: TestClient,
    recommendations_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.post(f"/datasets/{dataset_id}/recommendations")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "recommendations_not_available"


def test_list_recommendations_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    recommendations_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/recommendations")
    assert response.status_code == 404


def test_list_recommendations_empty_for_new_dataset(
    application: FastAPI,
    client: TestClient,
    recommendations_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(f"/datasets/{dataset_id}/recommendations")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["pagination"]["total_items"] == 0


def test_get_recommendation_unknown_id_returns_404(
    application: FastAPI,
    client: TestClient,
    recommendations_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/recommendations/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


def test_openapi_documents_recommendation_endpoints(
    application: FastAPI,
    client: TestClient,
    recommendations_environment: None,
) -> None:
    document = client.get("/openapi.json").json()
    paths = document["paths"]
    assert "/datasets/{dataset_id}/recommendations" in paths
    assert "post" in paths["/datasets/{dataset_id}/recommendations"]
    assert (
        paths["/datasets/{dataset_id}/recommendations"]["post"]["operationId"]
        == "create_dataset_recommendations"
    )
    assert (
        paths["/datasets/{dataset_id}/recommendations/{recommendation_id}"]["get"][
            "operationId"
        ]
        == "get_dataset_recommendation"
    )
    assert (
        paths["/datasets/{dataset_id}/recommendations"]["get"]["operationId"]
        == "list_dataset_recommendations"
    )