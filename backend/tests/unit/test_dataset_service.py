"""Unit tests for the dataset service ingestion workflow."""

from datetime import datetime
from pathlib import Path
from typing import cast
from uuid import UUID

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi import UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.exceptions import ApplicationError
from app.db.base import Base
from app.db.models.dataset import Dataset
from app.db.repositories.datasets import DatasetRepository
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.services.dataset_service import DatasetService
from app.services.exceptions import DatasetNotFoundError
from app.storage.files import LocalFileStorage


def _make_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        app_name="Test",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
        max_upload_size_mb=1,
    )


def _service(session: Session, settings: Settings) -> DatasetService:
    readers = MetadataReaderRegistry(
        {
            DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
            DatasetFormat.PARQUET: ParquetMetadataReader(),
        }
    )
    return DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=LocalFileStorage(settings.storage_path),
        validator=DatasetFileValidator(),
        readers=readers,
        settings=settings,
    )


def _upload(payload: bytes, filename: str) -> UploadFile:
    file = cast(object, __import__("io").BytesIO(payload))
    return UploadFile(file=file, filename=filename)  # type: ignore[arg-type]


def test_ingest_creates_dataset_with_immutable_first_version(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)
    payload = b"id,name\n1,alice\n2,bob\n"
    upload = _upload(payload, "people.csv")

    dataset = service.ingest(upload=upload, name="people", description="real description")

    assert dataset.id is not None
    assert dataset.name == "people"
    assert dataset.description == "real description"
    assert len(dataset.versions) == 1
    version = dataset.versions[0]
    assert version.version_number == 1
    assert version.format == DatasetFormat.CSV
    assert version.size_bytes == len(payload)
    assert version.row_count == 2
    assert version.column_count == 2
    assert [column.name for column in version.columns] == ["id", "name"]
    assert (
        settings.storage_path
        / "datasets"
        / str(dataset.id)
        / "versions"
        / str(version.id)
        / "original.csv"
    ).exists()
    assert version.content_sha256


def test_ingest_persists_parquet_version(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)
    table = pa.table({"id": [1, 2, 3], "country": ["US", "DE", "US"]})
    file_path = tmp_path / "data.parquet"
    pq.write_table(table, file_path)
    upload = _upload(file_path.read_bytes(), "data.parquet")

    dataset = service.ingest(upload=upload, name="countries", description=None)

    version = dataset.versions[0]
    assert version.format == DatasetFormat.PARQUET
    assert version.row_count == 3
    types = {column.name: column.logical_type for column in version.columns}
    assert types["id"].value == "integer"
    assert types["country"].value == "string"


def test_ingest_rolls_back_database_on_validation_failure(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)
    upload = _upload(b"\xff\xfe\xfd", "broken.csv")  # Bytes that are not valid UTF-8.

    with pytest.raises(Exception) as excinfo:
        service.ingest(upload=upload, name="broken", description=None)

    assert excinfo.value is not None
    assert session.query(Dataset).count() == 0
    staged = list((settings.storage_path / ".staging").glob("upload-*.tmp"))
    assert staged == []


def test_ingest_normalizes_blank_description_to_null(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)
    upload = _upload(b"id\n1\n", "people.csv")

    dataset = service.ingest(upload=upload, name="people", description="   ")

    assert dataset.description is None


def test_ingest_rolls_back_files_on_database_failure(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)

    class FlakyRepository(DatasetRepository):
        def add(self, dataset: Dataset) -> None:  # type: ignore[override]
            super().add(dataset)
            raise RuntimeError("forced database failure")

    readers = MetadataReaderRegistry(
        {
            DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
        }
    )
    service = DatasetService(
        session=session,
        repository=FlakyRepository(session),
        storage=LocalFileStorage(settings.storage_path),
        validator=DatasetFileValidator(),
        readers=readers,
        settings=settings,
    )
    upload = _upload(b"id,name\n1,a\n", "people.csv")

    with pytest.raises(RuntimeError):
        service.ingest(upload=upload, name="people", description=None)

    datasets_root = settings.storage_path / "datasets"
    assert list(datasets_root.glob("**/original.csv")) == []


def test_ingest_rejects_oversize_uploads(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    settings = Settings(
        _env_file=None,
        app_name="Test",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
        max_upload_size_mb=1,
    )
    settings.upload_chunk_size_bytes = 64 * 1024
    service = _service(session, settings)
    upload = _upload(b"x" * (2 * 1024 * 1024), "people.csv")

    with pytest.raises(ApplicationError):
        service.ingest(upload=upload, name="people", description=None)

    assert session.query(Dataset).count() == 0


def test_get_raises_dataset_not_found(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)

    with pytest.raises(DatasetNotFoundError) as exc:
        service.get(UUID("00000000-0000-0000-0000-000000000000"))
    assert exc.value.status_code == 404
    assert exc.value.code == "dataset_not_found"


def test_list_pagination_returns_first_page(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)
    for index in range(3):
        service.ingest(
            upload=_upload(f"id\n{index}\n".encode(), f"f{index}.csv"),
            name=f"d{index}",
            description=None,
        )

    page = service.list_datasets(page=1, page_size=2)

    assert page.total_items == 3
    assert len(page.items) == 2


def test_list_versions_for_unknown_dataset_raises(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)

    with pytest.raises(DatasetNotFoundError):
        service.list_versions(UUID("00000000-0000-0000-0000-000000000000"), page=1, page_size=10)


def test_ingest_records_creation_timestamp(tmp_path: Path) -> None:
    session = _make_session()
    settings = _settings(tmp_path)
    service = _service(session, settings)

    dataset = service.ingest(
        upload=_upload(b"id\n1\n", "people.csv"),
        name="people",
        description=None,
    )

    assert isinstance(dataset.created_at, datetime)
    assert isinstance(dataset.versions[0].created_at, datetime)
