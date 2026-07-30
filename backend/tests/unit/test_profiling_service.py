"""Unit tests for ProfilingService against an in-memory SQLite database."""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi import UploadFile
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models.dataset import Dataset, DatasetVersion
from app.db.models.profile import ColumnProfile, DatasetProfile
from app.db.repositories.profiles import ProfileRepository
from app.ingestion.readers import (
    CsvMetadataReader,
    MetadataReaderRegistry,
    ParquetMetadataReader,
)
from app.ingestion.types import DatasetFormat, DatasetVersionStatus
from app.ingestion.validators import DatasetFileValidator
from app.profiling.exceptions import (
    DatasetNotProfileableError,
    ProfileStorageError,
)
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
from app.services.dataset_service import DatasetService
from app.services.exceptions import DatasetNotFoundError
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


def _build_settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        app_name="Profiling Service Tests",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
    )


def _ingest_dataset(
    session: Session,
    settings: Settings,
    storage: LocalFileStorage,
    csv_text: str,
    name: str = "people",
) -> Dataset:
    readers = MetadataReaderRegistry(
        {
            DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
            DatasetFormat.PARQUET: ParquetMetadataReader(),
        }
    )
    service = DatasetService(
        session=session,
        repository=None,  # type: ignore[arg-type]
        storage=storage,
        validator=DatasetFileValidator(),
        readers=readers,
        settings=settings,
    )
    # The dataset repository is unused by ingest because `add` uses the session.
    upload = UploadFile(file=io.BytesIO(csv_text.encode()), filename="people.csv")  # type: ignore[arg-type]
    return service.ingest(upload=upload, name=name, description=None)


@pytest.fixture
def session_factory(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    engine, factory = _create_sqlite_engine()
    yield factory
    engine.dispose()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return _build_settings(tmp_path)


@pytest.fixture
def storage(settings: Settings) -> LocalFileStorage:
    return LocalFileStorage(settings.storage_path)


@pytest.fixture
def dataset(session_factory: sessionmaker[Session], settings: Settings, storage: LocalFileStorage) -> Dataset:
    session = session_factory()
    try:
        return _ingest_dataset(session, settings, storage, "id,name\n1,alice\n2,bob\n")
    finally:
        session.close()


def _make_service(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    *,
    profiler: DatasetProfiler | None = None,
) -> tuple[ProfilingService, Session]:
    session = session_factory()
    profiler = profiler or DatasetProfiler(
        sample_size=10_000,
        csv_infer_length=10_000,
        top_values_limit=5,
    )
    service = ProfilingService(
        session=session,
        repository=ProfileRepository(session),
        storage=storage,
        profiler=profiler,
        settings=settings,
    )
    return service, session


def test_profile_dataset_persists_profile_and_columns(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        version = session.get(DatasetVersion, dataset.versions[0].id)
        assert version is not None
        profile = service.profile_dataset(dataset.id, version)

        assert isinstance(profile, DatasetProfile)
        assert profile.dataset_id == dataset.id
        assert profile.dataset_version_id == version.id
        assert profile.sampled.value == "full"
        assert profile.sample_size == 2
        assert profile.duration_ms >= 0
        assert isinstance(profile.started_at, type(profile.created_at))
        assert profile.columns
        names = {column.name for column in profile.columns}
        assert names == {"id", "name"}
    finally:
        session.close()


def test_profile_latest_version_uses_highest_version(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        profile = service.profile_latest_version(dataset.id)
        assert profile.dataset_version_id == dataset.versions[-1].id
    finally:
        session.close()


def test_profile_latest_version_without_versions_raises_409(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        with pytest.raises(DatasetNotProfileableError) as excinfo:
            service.profile_latest_version(uuid4())
        assert excinfo.value.status_code == 409
    finally:
        session.close()


def test_get_latest_returns_most_recent_profile(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        version = session.get(DatasetVersion, dataset.versions[0].id)
        assert version is not None
        first = service.profile_dataset(dataset.id, version)
        second = service.profile_dataset(dataset.id, version)

        latest = service.get_latest(dataset.id)
        assert latest is not None
        assert latest.id == second.id
        assert latest.id != first.id
    finally:
        session.close()


def test_get_for_version_returns_none_when_no_profile_yet(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        version_id = dataset.versions[0].id
        assert service.get_for_version(dataset.id, version_id) is None
    finally:
        session.close()


def test_get_for_version_unknown_version_raises_conflict(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        with pytest.raises(DatasetNotProfileableError):
            service.get_for_version(dataset.id, uuid4())
    finally:
        session.close()


def test_list_for_dataset_paginates(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        version = session.get(DatasetVersion, dataset.versions[0].id)
        assert version is not None
        for _ in range(3):
            service.profile_dataset(dataset.id, version)

        items, total = service.list_for_dataset(dataset.id, offset=0, limit=2)
        assert total == 3
        assert len(items) == 2

        items_rest, total_rest = service.list_for_dataset(dataset.id, offset=2, limit=2)
        assert total_rest == 3
        assert len(items_rest) == 1
    finally:
        session.close()


def test_list_for_dataset_unknown_dataset_raises_404(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        with pytest.raises(DatasetNotFoundError):
            service.list_for_dataset(uuid4(), offset=0, limit=10)
    finally:
        session.close()


def test_profile_dataset_rolls_back_on_storage_failure(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    class _BoomProfiler:
        def profile(
            self,
            dataset_format: DatasetFormat,
            path: Path,
            *,
            dataset_id: UUID | None = None,
            dataset_version_id: UUID | None = None,
        ) -> None:
            raise FileNotFoundError("original missing")

    service, session = _make_service(
        session_factory, settings, storage, profiler=_BoomProfiler()  # type: ignore[arg-type]
    )
    try:
        version = session.get(DatasetVersion, dataset.versions[0].id)
        assert version is not None
        with pytest.raises(ProfileStorageError):
            service.profile_dataset(dataset.id, version)

        repository = ProfileRepository(session)
        assert repository.get_latest_for_version(version.id) is None
        assert session.query(DatasetProfile).count() == 0
        assert session.query(ColumnProfile).count() == 0
    finally:
        session.close()


def test_profile_dataset_uses_immutable_status(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    dataset: Dataset,
) -> None:
    service, session = _make_service(session_factory, settings, storage)
    try:
        version = session.get(DatasetVersion, dataset.versions[0].id)
        assert version is not None
        assert version.status == DatasetVersionStatus.STORED
        service.profile_dataset(dataset.id, version)
        session.refresh(version)
        assert version.status == DatasetVersionStatus.STORED
    finally:
        session.close()