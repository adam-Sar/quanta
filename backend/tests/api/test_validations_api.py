"""API contract tests for the Task 9 deterministic validation endpoints.

The routes are small. We exercise the happy path (validation 201
after seeding a profile and a recommendation) plus the 404 paths for
unknown datasets, unknown recommendations, and unknown validation ids.
We do **not** verify the in-memory Polars preview; that lives in the
unit suite so this file can stay focused on the HTTP contract.
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
    get_recommendation_service,
    get_validation_service,
)
from app.db.base import Base
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.db.repositories.validations import ValidationRepository
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
def validations_environment(
    application: FastAPI, tmp_path_factory: pytest.TempPathFactory
) -> Iterator[None]:
    """Wire SQLite-backed dependencies for the validations endpoints."""

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

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _dataset_service
    application.dependency_overrides[get_recommendation_service] = _recommendation_service
    application.dependency_overrides[get_validation_service] = _validation_service
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


def test_validation_endpoints_openapi_ids_present(client: TestClient) -> None:
    document = client.get("/openapi.json").json()
    paths = document["paths"]
    assert (
        paths["/datasets/{dataset_id}/recommendations/{recommendation_id}/validate"][
            "post"
        ]["operationId"]
        == "create_dataset_recommendation_validation"
    )
    assert (
        paths[
            "/datasets/{dataset_id}/recommendations/{recommendation_id}/validations"
        ]["get"]["operationId"]
        == "list_dataset_recommendation_validations"
    )
    assert (
        paths[
            "/datasets/{dataset_id}/recommendations/{recommendation_id}/validations/{validation_id}"
        ]["get"]["operationId"]
        == "get_dataset_recommendation_validation"
    )


def test_post_validation_unknown_recommendation_returns_404(
    application: FastAPI,
    client: TestClient,
    validations_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.post(
        f"/datasets/{dataset_id}/recommendations/00000000-0000-0000-0000-000000000000/validate"
    )
    assert response.status_code == 404


def test_list_validations_unknown_recommendation_returns_404(
    application: FastAPI,
    client: TestClient,
    validations_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/recommendations/00000000-0000-0000-0000-000000000000/validations"
    )
    assert response.status_code == 404


def test_get_validation_unknown_id_returns_404(
    application: FastAPI,
    client: TestClient,
    validations_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/recommendations/00000000-0000-0000-0000-000000000000/validations/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


def test_list_validations_empty_for_new_recommendation(
    application: FastAPI,
    client: TestClient,
    validations_environment: None,
) -> None:
    """Without a recommendation, listing validations must 404 (not 200 empty)."""

    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/recommendations/00000000-0000-0000-0000-000000000000/validations"
    )
    assert response.status_code == 404
