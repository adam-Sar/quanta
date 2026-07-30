"""Profiling orchestration over a stored dataset version."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Generic, TypeVar
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.dataset import DatasetVersion
from app.db.models.profile import ColumnProfile, DatasetProfile
from app.db.repositories.profiles import ProfileRepository
from app.ingestion.types import DatasetFormat
from app.profiling.exceptions import (
    DatasetNotProfileableError,
    InvalidProfileStateError,
    ProfileStorageError,
)
from app.profiling.metrics import DatasetProfiler, to_column_metrics_dicts
from app.profiling.types import (
    ColumnSamplingFlag,
    DatasetVersionProfile,
    PersistedColumnProfile,
)
from app.services.exceptions import DatasetNotFoundError
from app.storage.files import FileStorage

logger = logging.getLogger(__name__)
T = TypeVar("T")


class ProfilingService:
    """Compute a profile over a stored dataset version and persist it.

    The service reads the original file via the local file storage, runs
    the deterministic ``DatasetProfiler`` over a bounded Polars frame, and
    commits a new ``DatasetProfile`` row plus ``ColumnProfile`` rows. A
    database failure rolls back the row insert; the original file is never
    mutated by profiling, so no storage compensation is needed.
    """

    def __init__(
        self,
        *,
        session: Session,
        repository: ProfileRepository,
        storage: FileStorage,
        profiler: DatasetProfiler,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.storage = storage
        self.profiler = profiler
        self.settings = settings

    def profile_latest_version(self, dataset_id: UUID) -> DatasetProfile:
        """Compute a fresh profile for the most recent dataset version."""

        version = self._resolve_latest_version(dataset_id)
        if version is None:
            raise DatasetNotProfileableError()
        return self.profile_dataset(dataset_id, version)

    def profile_dataset(
        self,
        dataset_id: UUID,
        dataset_version: DatasetVersion,
    ) -> DatasetProfile:
        path = self._resolve_storage_path(dataset_version)
        started = time.perf_counter()
        try:
            result = self.profiler.profile(
                DatasetFormat(dataset_version.format),
                path,
                dataset_id=dataset_version.dataset_id,
                dataset_version_id=dataset_version.id,
            )
        except FileNotFoundError as exc:
            logger.warning(
                "profile_original_missing",
                extra={
                    "error_code": "profile_original_missing",
                    "dataset_version_id": str(dataset_version.id),
                },
            )
            raise ProfileStorageError from exc
        except OSError as exc:
            logger.exception(
                "profile_storage_error",
                extra={
                    "error_code": "profile_storage_error",
                    "dataset_version_id": str(dataset_version.id),
                },
            )
            raise ProfileStorageError from exc

        profile_id = uuid4()
        duration_ms = int((time.perf_counter() - started) * 1000)
        now = datetime.now(UTC)
        try:
            profile = DatasetProfile(
                id=profile_id,
                dataset_id=dataset_version.dataset_id,
                dataset_version_id=dataset_version.id,
                sample_size=result.sample_size,
                sampled=ColumnSamplingFlag(result.sampled.value),
                started_at=now,
                completed_at=now,
                duration_ms=duration_ms,
            )
            column_payloads = to_column_metrics_dicts(result.columns)
            for payload in column_payloads:
                profile.columns.append(
                    ColumnProfile(
                        dataset_profile_id=profile_id,
                        name=payload["name"],
                        ordinal_position=payload["ordinal_position"],
                        metrics=payload["metrics"],
                    )
                )
            self.repository.add(profile)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        return profile

    def get_latest(self, dataset_id: UUID) -> DatasetProfile | None:
        version = self._resolve_latest_version(dataset_id)
        if version is None:
            return None
        return self.repository.get_latest_for_version(version.id)

    def get_for_version(
        self,
        dataset_id: UUID,
        version_id: UUID,
    ) -> DatasetProfile | None:
        self._ensure_version(dataset_id, version_id)
        return self.repository.get_latest_for_version(version_id)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[DatasetProfile], int]:
        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        return self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_storage_path(self, version: DatasetVersion) -> Path:
        key = version.storage_key
        try:
            return self.storage.path_for(key)
        except ValueError as exc:
            raise InvalidProfileStateError("invalid_storage_key") from exc

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        statement = self.session.execute(
            self.session.query(DatasetVersion).filter(
                DatasetVersion.dataset_id == dataset_id
            ).statement.with_only_columns(DatasetVersion.id).limit(1)
        )
        return statement.first() is not None

    def _resolve_latest_version(self, dataset_id: UUID) -> DatasetVersion | None:
        from sqlalchemy import select

        statement = (
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.version_number.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _ensure_version(self, dataset_id: UUID, version_id: UUID) -> DatasetVersion:
        from sqlalchemy import select

        version = self.session.scalar(
            select(DatasetVersion).where(
                DatasetVersion.id == version_id,
                DatasetVersion.dataset_id == dataset_id,
            )
        )
        if version is None:
            raise DatasetNotProfileableError()
        return version


def to_api_profile(profile: DatasetProfile) -> DatasetVersionProfile:
    """Map a persisted profile (with eager-loaded columns) to a domain object."""

    columns = tuple(
        PersistedColumnProfile(
            name=column.name,
            ordinal_position=column.ordinal_position,
            metrics=column.metrics,
        )
        for column in profile.columns
    )
    return DatasetVersionProfile(
        profile_id=profile.id,
        dataset_id=profile.dataset_id,
        dataset_version_id=profile.dataset_version_id,
        sample_size=profile.sample_size,
        sampled=ColumnSamplingFlag(profile.sampled.value),
        started_at=profile.started_at.isoformat() if profile.started_at else "",
        completed_at=profile.completed_at.isoformat() if profile.completed_at else "",
        duration_ms=profile.duration_ms,
        columns=columns,
    )