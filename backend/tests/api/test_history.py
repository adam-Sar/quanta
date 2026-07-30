"""API tests for the deterministic history endpoints (Task 6).

The HTTP routes cover lineage lookups and the comparison validation
contract. The successful ``POST /comparisons`` flow is exercised at
the service layer in ``tests/unit/test_history_service.py`` because
the public API has no second-version upload endpoint yet; future
versions can lift that test here unchanged.
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
    get_history_service,
)
from app.db.base import Base
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.history_comparisons import HistoryComparisonRepository
from app.db.session import get_db
from app.history.service import HistoryService
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
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
def history_environment(application: FastAPI) -> Iterator[None]:
    """Wire SQLite-backed dependencies for the history endpoints."""

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

    def _history_service() -> HistoryService:
        session = factory()
        return HistoryService(
            session=session,
            repository=HistoryComparisonRepository(session),
            settings=settings,
        )

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _dataset_service
    application.dependency_overrides[get_history_service] = _history_service
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


def test_get_lineage_returns_empty_for_single_version(
    application: FastAPI,
    client: TestClient,
    history_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(f"/datasets/{dataset_id}/lineage")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dataset_id"] == dataset_id
    assert body["edges"] == []


def test_get_lineage_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    history_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/lineage")
    assert response.status_code == 404


def test_post_comparison_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    history_environment: None,
) -> None:
    response = client.post(
        "/datasets/00000000-0000-0000-0000-000000000000/comparisons",
        json={
            "base_version_id": "00000000-0000-0000-0000-000000000001",
            "target_version_id": "00000000-0000-0000-0000-000000000002",
        },
    )
    assert response.status_code == 404


def test_post_comparison_same_version_returns_400(
    application: FastAPI,
    client: TestClient,
    history_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    version_id = cast(str, client.get(f"/datasets/{dataset_id}").json()["current_version"]["id"])

    response = client.post(
        f"/datasets/{dataset_id}/comparisons",
        json={"base_version_id": version_id, "target_version_id": version_id},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "same_version_comparison"


def test_list_comparisons_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    history_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/comparisons")
    assert response.status_code == 404


def test_get_comparison_unknown_id_returns_404(
    application: FastAPI,
    client: TestClient,
    history_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/comparisons/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404
