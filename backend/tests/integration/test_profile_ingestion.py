"""Opt-in PostgreSQL test verifying the profiling flow end to end."""

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
from app.db.repositories.profiles import ProfileRepository
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


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_DATABASE_TESTS") != "1",
    reason=(
        "Set RUN_DATABASE_TESTS=1 with DATABASE_URL pointing to a disposable PostgreSQL database"
    ),
)
def test_profiling_persists_profile_and_columns(tmp_path: Path) -> None:
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
    storage = LocalFileStorage(settings.storage_path)
    readers = MetadataReaderRegistry(
        {
            DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
            DatasetFormat.PARQUET: ParquetMetadataReader(),
        }
    )
    dataset_service = DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=storage,
        validator=DatasetFileValidator(),
        readers=readers,
        settings=settings,
    )
    upload = UploadFile(file=io.BytesIO(b"id,name\n1,alice\n2,bob\n"), filename="people.csv")  # type: ignore[arg-type]
    dataset = dataset_service.ingest(upload=upload, name="people", description=None)

    profiling_service = ProfilingService(
        session=session,
        repository=ProfileRepository(session),
        storage=storage,
        profiler=DatasetProfiler(
            sample_size=settings.profile_default_sample_rows,
            csv_infer_length=settings.csv_infer_schema_length,
            top_values_limit=settings.profile_top_values_limit,
        ),
        settings=settings,
    )

    try:
        profile = profiling_service.profile_latest_version(dataset.id)
        assert profile.dataset_id == dataset.id
        assert profile.sampled.value == "full"
        assert profile.sample_size == 2
        assert profile.duration_ms >= 0

        profile_rows = session.execute(text("SELECT COUNT(*) FROM dataset_profiles")).scalar_one()
        column_rows = session.execute(text("SELECT COUNT(*) FROM column_profiles")).scalar_one()
        assert profile_rows == 1
        assert column_rows == 2
    finally:
        Base.metadata.drop_all(engine)