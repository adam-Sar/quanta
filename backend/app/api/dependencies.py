"""Dependency composition for HTTP-facing application services."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.profiles import ProfileRepository
from app.db.session import get_db
from app.ingestion.readers import CsvMetadataReader, MetadataReaderRegistry, ParquetMetadataReader
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
from app.services.dataset_service import DatasetService
from app.storage.files import LocalFileStorage


def get_dataset_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DatasetService:
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


def get_profiling_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ProfilingService:
    """Compose the deterministic Polars profiler with persistence and storage."""

    profiler = DatasetProfiler(
        sample_size=settings.profile_default_sample_rows,
        csv_infer_length=settings.csv_infer_schema_length,
        top_values_limit=settings.profile_top_values_limit,
    )
    return ProfilingService(
        session=session,
        repository=ProfileRepository(session),
        storage=LocalFileStorage(settings.storage_path),
        profiler=profiler,
        settings=settings,
    )