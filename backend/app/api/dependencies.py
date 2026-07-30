"""Dependency composition for HTTP-facing application services."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.repositories.datasets import DatasetRepository
from app.db.session import get_db
from app.ingestion.readers import CsvMetadataReader, MetadataReaderRegistry, ParquetMetadataReader
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
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
