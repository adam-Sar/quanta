"""Orchestrate safe uploads across storage, metadata readers, and PostgreSQL."""

import logging
from dataclasses import dataclass
from typing import TypeVar
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.dataset import Dataset, DatasetColumn, DatasetVersion
from app.db.repositories.datasets import DatasetRepository
from app.ingestion.readers.registry import MetadataReaderRegistry
from app.ingestion.types import DatasetVersionStatus, StagedUpload
from app.ingestion.validators.files import DatasetFileValidator, normalize_original_filename
from app.services.exceptions import DatasetNotFoundError
from app.storage.files import FileStorage

logger = logging.getLogger(__name__)
T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class Page[T]:
    items: tuple[T, ...]
    total_items: int


class DatasetService:
    """Maintain the DB/file compensation boundary for immutable original uploads."""

    def __init__(
        self,
        *,
        session: Session,
        repository: DatasetRepository,
        storage: FileStorage,
        validator: DatasetFileValidator,
        readers: MetadataReaderRegistry,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.storage = storage
        self.validator = validator
        self.readers = readers
        self.settings = settings

    def ingest(
        self,
        *,
        upload: UploadFile,
        name: str,
        description: str | None,
    ) -> Dataset:
        original_filename = normalize_original_filename(upload.filename)
        staged: StagedUpload | None = None
        storage_key: str | None = None
        promoted = False
        try:
            staged = self.storage.stage(
                upload.file,
                original_filename=original_filename,
                media_type=upload.content_type,
                max_size_bytes=self.settings.max_upload_size_bytes,
                chunk_size_bytes=self.settings.upload_chunk_size_bytes,
            )
            dataset_format = self.validator.validate(staged)
            metadata = self.readers.read(dataset_format, staged.path)

            dataset_id = uuid4()
            version_id = uuid4()
            storage_key = (
                f"datasets/{dataset_id}/versions/{version_id}/original.{dataset_format.value}"
            )
            self.storage.promote(staged, storage_key)
            promoted = True

            description_value = description.strip() if description is not None else ""
            normalized_description = description_value or None
            dataset = Dataset(
                id=dataset_id,
                name=name.strip(),
                description=normalized_description,
            )
            version = DatasetVersion(
                id=version_id,
                dataset_id=dataset_id,
                version_number=1,
                format=dataset_format,
                status=DatasetVersionStatus.STORED,
                original_filename=original_filename,
                media_type=upload.content_type,
                storage_key=storage_key,
                content_sha256=staged.content_sha256,
                size_bytes=staged.size_bytes,
                row_count=metadata.row_count,
                column_count=metadata.column_count,
            )
            version.columns.extend(
                DatasetColumn(
                    dataset_version_id=version_id,
                    name=column.name,
                    ordinal_position=column.ordinal_position,
                    physical_type=column.physical_type,
                    logical_type=column.logical_type,
                    nullable=column.nullable,
                )
                for column in metadata.columns
            )
            dataset.versions.append(version)
            self.repository.add(dataset)
            self.session.commit()
            return dataset
        except Exception:
            self.session.rollback()
            if promoted and storage_key is not None:
                self._delete_after_failure(storage_key)
            elif staged is not None:
                self.storage.discard_stage(staged)
            raise

    def get(self, dataset_id: UUID) -> Dataset:
        dataset = self.repository.get(dataset_id)
        if dataset is None:
            raise DatasetNotFoundError(dataset_id)
        return dataset

    def list_datasets(self, *, page: int, page_size: int) -> Page[Dataset]:
        datasets, total = self.repository.list_datasets(
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return Page(items=tuple(datasets), total_items=total)

    def list_versions(
        self,
        dataset_id: UUID,
        *,
        page: int,
        page_size: int,
    ) -> Page[DatasetVersion]:
        if not self.repository.exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        versions, total = self.repository.list_dataset_versions(
            dataset_id,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return Page(items=tuple(versions), total_items=total)

    def _delete_after_failure(self, storage_key: str) -> None:
        try:
            self.storage.delete(storage_key)
        except OSError:
            logger.exception(
                "ingestion_compensation_failed",
                extra={"error_code": "storage_cleanup_failed"},
            )
