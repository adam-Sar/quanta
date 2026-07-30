"""Opt-in PostgreSQL test verifying the dataset ingestion flow end to end."""

import io
import os
from pathlib import Path

import pytest
from fastapi import UploadFile
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.base import Base
from app.db.repositories.datasets import DatasetRepository
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.services.dataset_service import DatasetService
from app.storage.files import LocalFileStorage


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_DATABASE_TESTS") != "1",
    reason=(
        "Set RUN_DATABASE_TESTS=1 with DATABASE_URL pointing to a disposable PostgreSQL database"
    ),
)
def test_dataset_ingestion_persists_immutable_version(tmp_path: Path) -> None:
    engine = create_engine(os.environ["DATABASE_URL"], future=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    settings = Settings(
        _env_file=None,
        app_name="Integration",
        environment="test",
        log_format="console",
        database_url=os.environ["DATABASE_URL"],
        storage_path=tmp_path / "storage",
    )
    readers = MetadataReaderRegistry(
        {
            DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
            DatasetFormat.PARQUET: ParquetMetadataReader(),
        }
    )
    service = DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=LocalFileStorage(settings.storage_path),
        validator=DatasetFileValidator(),
        readers=readers,
        settings=settings,
    )
    file_obj = io.BytesIO(b"id,name\n1,a\n")
    upload = UploadFile(file=file_obj, filename="people.csv")  # type: ignore[arg-type]

    dataset = service.ingest(upload=upload, name="people", description=None)

    try:
        rows = session.execute(text("SELECT COUNT(*) FROM dataset_versions")).scalar_one()
        columns = session.execute(text("SELECT COUNT(*) FROM dataset_columns")).scalar_one()
        assert rows == 1
        assert columns == 2
        assert dataset.id is not None
    finally:
        Base.metadata.drop_all(engine)
