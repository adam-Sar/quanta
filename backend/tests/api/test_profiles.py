"""API tests for the deterministic profiling endpoints (Task 3)."""

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
    get_profiling_service,
)
from app.db.base import Base
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.profiles import ProfileRepository
from app.db.session import get_db
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
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
def profile_environment(
    application: FastAPI,
) -> Iterator[None]:
    """Wire SQLite-backed dependencies for the profiling service."""

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

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _dataset_service
    application.dependency_overrides[get_profiling_service] = _profiling_service
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


def test_post_profile_creates_run_and_returns_201(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)

    response = client.post(f"/datasets/{dataset_id}/profile")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["dataset_id"] == dataset_id
    assert body["sample_size"] == 2
    assert body["sampled"] == "full"
    assert body["duration_ms"] >= 0
    column_names = {column["name"] for column in body["columns"]}
    assert column_names == {"id", "name"}
    id_column = next(column for column in body["columns"] if column["name"] == "id")
    assert id_column["metrics"]["null_count"] == 0
    assert id_column["metrics"]["distinct_count"] == 2
    assert id_column["metrics"]["numeric"]["max"] == 2
    name_column = next(column for column in body["columns"] if column["name"] == "name")
    assert name_column["metrics"]["null_count"] == 0
    assert name_column["metrics"]["distinct_count"] == 2
    assert name_column["metrics"]["top_values"][0]["value"] in {"alice", "bob"}


def test_get_latest_profile_returns_persisted_run(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    post_response = client.post(f"/datasets/{dataset_id}/profile")
    profile_id = post_response.json()["profile_id"]

    response = client.get(f"/datasets/{dataset_id}/profile")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["profile_id"] == profile_id


def test_get_version_profile_returns_persisted_run(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    create = client.get(f"/datasets/{dataset_id}").json()
    version_id = create["current_version"]["id"]
    client.post(f"/datasets/{dataset_id}/profile")

    response = client.get(f"/datasets/{dataset_id}/versions/{version_id}/profile")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dataset_version_id"] == version_id


def test_get_profile_for_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/profile")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_get_profile_without_runs_returns_409(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(f"/datasets/{dataset_id}/profile")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "dataset_not_profileable"


def test_get_version_profile_for_unknown_version_returns_409(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    response = client.get(
        f"/datasets/{dataset_id}/versions/00000000-0000-0000-0000-000000000000/profile"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "dataset_not_profileable"


def test_post_profile_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    response = client.post("/datasets/00000000-0000-0000-0000-000000000000/profile")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_list_profiles_endpoint_paginates(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    for _ in range(3):
        response = client.post(f"/datasets/{dataset_id}/profile")
        assert response.status_code == 201

    response = client.get(f"/datasets/{dataset_id}/profiles?page=1&page_size=2")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pagination"] == {
        "page": 1,
        "page_size": 2,
        "total_items": 3,
        "total_pages": 2,
    }
    assert len(body["items"]) == 2


def test_list_profiles_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/profiles")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_profile_persists_immutable_history(
    application: FastAPI,
    client: TestClient,
    profile_environment: None,
) -> None:
    dataset_id = _create_dataset(client)
    first = client.post(f"/datasets/{dataset_id}/profile").json()
    second = client.post(f"/datasets/{dataset_id}/profile").json()

    assert first["profile_id"] != second["profile_id"]

    listed = client.get(f"/datasets/{dataset_id}/profiles?page=1&page_size=10").json()
    ids = [item["profile_id"] for item in listed["items"]]
    assert ids[0] == second["profile_id"]
    assert first["profile_id"] in ids
