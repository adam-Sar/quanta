"""API tests for the dataset ingestion and inspection endpoints."""

import io
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_dataset_service
from app.db.base import Base
from app.db.repositories.datasets import DatasetRepository
from app.db.session import get_db
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
def dataset_environment(
    application: FastAPI,
) -> Iterator[None]:
    """Wire SQLite-backed in-memory dependencies for the dataset service tests."""

    _, factory = _create_sqlite_engine()
    settings = application.state.settings
    storage = LocalFileStorage(settings.storage_path)

    def _db() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    def _service() -> DatasetService:
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

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_dataset_service] = _service
    yield
    application.dependency_overrides.clear()


def _csv_bytes(payload: str) -> bytes:
    return payload.encode()


def test_upload_csv_creates_dataset_and_returns_201(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    response = client.post(
        "/datasets",
        data={"name": "people", "description": " client description "},
        files={
            "file": (
                "people.csv",
                io.BytesIO(_csv_bytes("id,name\n1,alice\n2,bob\n")),
                "text/csv",
            )
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "people"
    assert body["description"] == "client description"
    assert body["current_version"]["row_count"] == 2
    assert body["current_version"]["format"] == "csv"
    assert {col["name"] for col in body["current_version"]["columns"]} == {"id", "name"}


def test_upload_rejects_unsupported_format(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    response = client.post(
        "/datasets",
        data={"name": "people"},
        files={"file": ("people.txt", io.BytesIO(b"not supported"), "text/plain")},
    )

    assert response.status_code == 415
    body = response.json()
    assert body["error"]["code"] == "unsupported_file_format"
    assert body["error"]["details"]["supported_extensions"] == [".csv", ".parquet"]


def test_upload_rejects_empty_file(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    response = client.post(
        "/datasets",
        data={"name": "people"},
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "empty_upload"


def test_upload_rejects_oversize(
    application: FastAPI,
    client: TestClient,
) -> None:
    from app.ingestion.exceptions import UploadTooLargeError
    from app.ingestion.types import StagedUpload

    original_stage = LocalFileStorage.stage

    def _forcing_stage(
        self: LocalFileStorage,
        stream: object,
        *,
        original_filename: str,
        media_type: str | None,
        max_size_bytes: int,
        chunk_size_bytes: int,
    ) -> StagedUpload:
        raise UploadTooLargeError(max_size_bytes)

    LocalFileStorage.stage = _forcing_stage  # type: ignore[method-assign]
    try:
        response = client.post(
            "/datasets",
            data={"name": "people"},
            files={"file": ("people.csv", io.BytesIO(b"id\n1\n"), "text/csv")},
        )
    finally:
        LocalFileStorage.stage = original_stage  # type: ignore[method-assign]

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "upload_too_large"


def test_upload_rejects_missing_form_name(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    response = client.post(
        "/datasets",
        data={},
        files={"file": ("people.csv", io.BytesIO(b"id\n1\n"), "text/csv")},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"


def test_list_datasets_paginates(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    for index in range(3):
        response = client.post(
            "/datasets",
            data={"name": f"d{index}"},
            files={
                "file": (
                    f"f{index}.csv",
                    io.BytesIO(f"id\n{index}\n".encode()),
                    "text/csv",
                )
            },
        )
        assert response.status_code == 201

    response = client.get("/datasets?page=1&page_size=2")

    assert response.status_code == 200
    body = response.json()
    assert body["pagination"] == {
        "page": 1,
        "page_size": 2,
        "total_items": 3,
        "total_pages": 2,
    }
    assert len(body["items"]) == 2
    assert all(item["current_version"] is not None for item in body["items"])


def test_get_unknown_dataset_returns_404(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_get_returns_dataset_with_current_version(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    create_response = client.post(
        "/datasets",
        data={"name": "people"},
        files={"file": ("people.csv", io.BytesIO(b"id\n1\n"), "text/csv")},
    )
    dataset_id = create_response.json()["id"]

    response = client.get(f"/datasets/{dataset_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == dataset_id
    assert body["current_version"]["version_number"] == 1
    assert body["current_version"]["row_count"] == 1


def test_versions_endpoint_returns_paginated_versions(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    create_response = client.post(
        "/datasets",
        data={"name": "people"},
        files={"file": ("people.csv", io.BytesIO(b"id\n1\n"), "text/csv")},
    )
    dataset_id = create_response.json()["id"]

    response = client.get(f"/datasets/{dataset_id}/versions?page=1&page_size=10")

    assert response.status_code == 200
    body = response.json()
    assert body["pagination"] == {
        "page": 1,
        "page_size": 10,
        "total_items": 1,
        "total_pages": 1,
    }
    assert len(body["items"]) == 1


def test_versions_endpoint_returns_404_for_unknown_dataset(
    application: FastAPI,
    client: TestClient,
    dataset_environment: None,
) -> None:
    response = client.get("/datasets/00000000-0000-0000-0000-000000000000/versions")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"
