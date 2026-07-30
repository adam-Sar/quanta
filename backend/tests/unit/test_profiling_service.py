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
from app.db.repositories.datasets import DatasetRepository
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


def _make_profiler() -> DatasetProfiler:
    return DatasetProfiler(
        sample_size=10_000,
        csv_infer_length=10_000,
        top_values_limit=5,
    )


@pytest.fixture
def seeded_session(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
) -> Iterator[Session]:
    """A SQLite session with one dataset already ingested."""

    session = session_factory()
    try:
        readers = MetadataReaderRegistry(
            {
                DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
                DatasetFormat.PARQUET: ParquetMetadataReader(),
            }
        )
        service = DatasetService(
            session=session,
            repository=DatasetRepository(session),
            storage=storage,
            validator=DatasetFileValidator(),
            readers=readers,
            settings=settings,
        )
        upload = UploadFile(file=io.BytesIO(b"id,name\n1,alice\n2,bob\n"), filename="people.csv")  # type: ignore[arg-type]
        service.ingest(upload=upload, name="people", description=None)
        session.commit()
        yield session
    finally:
        session.close()


@pytest.fixture
def profiling_service(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
) -> ProfilingService:
    profiler = _make_profiler()
    session = session_factory()
    return ProfilingService(
        session=session,
        repository=ProfileRepository(session),
        storage=storage,
        profiler=profiler,
        settings=settings,
    )


def test_profile_dataset_persists_profile_and_columns(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    version = seeded_session.get(DatasetVersion, dataset.versions[0].id)
    assert version is not None
    profile = profiling_service.profile_dataset(dataset.id, version)

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


def test_profile_latest_version_uses_highest_version(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    profile = profiling_service.profile_latest_version(dataset.id)
    assert profile.dataset_version_id == dataset.versions[-1].id


def test_profile_latest_version_for_unknown_dataset_raises_404(
    profiling_service: ProfilingService,
) -> None:
    with pytest.raises(DatasetNotFoundError) as excinfo:
        profiling_service.profile_latest_version(uuid4())
    assert excinfo.value.status_code == 404


def test_get_latest_returns_most_recent_profile(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    version = seeded_session.get(DatasetVersion, dataset.versions[0].id)
    assert version is not None
    first = profiling_service.profile_dataset(dataset.id, version)
    second = profiling_service.profile_dataset(dataset.id, version)

    latest = profiling_service.get_latest(dataset.id)
    assert latest is not None
    assert latest.id == second.id
    assert latest.id != first.id


def test_get_for_version_returns_none_when_no_profile_yet(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    version_id = dataset.versions[0].id
    assert profiling_service.get_for_version(dataset.id, version_id) is None


def test_get_for_version_unknown_version_raises_conflict(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    with pytest.raises(DatasetNotProfileableError):
        profiling_service.get_for_version(dataset.id, uuid4())


def test_list_for_dataset_paginates(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    version = seeded_session.get(DatasetVersion, dataset.versions[0].id)
    assert version is not None
    for _ in range(3):
        profiling_service.profile_dataset(dataset.id, version)

    items, total = profiling_service.list_for_dataset(dataset.id, offset=0, limit=2)
    assert total == 3
    assert len(items) == 2

    items_rest, total_rest = profiling_service.list_for_dataset(dataset.id, offset=2, limit=2)
    assert total_rest == 3
    assert len(items_rest) == 1


def test_list_for_dataset_unknown_dataset_raises_404(
    profiling_service: ProfilingService,
) -> None:
    with pytest.raises(DatasetNotFoundError):
        profiling_service.list_for_dataset(uuid4(), offset=0, limit=10)


def test_profile_dataset_rolls_back_on_storage_failure(
    session_factory: sessionmaker[Session],
    settings: Settings,
    storage: LocalFileStorage,
    seeded_session: Session,
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

    session = session_factory()
    service = ProfilingService(
        session=session,
        repository=ProfileRepository(session),
        storage=storage,
        profiler=_BoomProfiler(),  # type: ignore[arg-type]
        settings=settings,
    )
    dataset = seeded_session.query(Dataset).one()
    version = seeded_session.get(DatasetVersion, dataset.versions[0].id)
    assert version is not None
    with pytest.raises(ProfileStorageError):
        service.profile_dataset(dataset.id, version)

    repository = ProfileRepository(session)
    assert repository.get_latest_for_version(version.id) is None
    assert session.query(DatasetProfile).count() == 0
    assert session.query(ColumnProfile).count() == 0
    session.close()


def test_profile_dataset_uses_immutable_status(
    profiling_service: ProfilingService,
    seeded_session: Session,
) -> None:
    dataset = seeded_session.query(Dataset).one()
    version = seeded_session.get(DatasetVersion, dataset.versions[0].id)
    assert version is not None
    assert version.status == DatasetVersionStatus.STORED
    profiling_service.profile_dataset(dataset.id, version)
    seeded_session.refresh(version)
    assert version.status == DatasetVersionStatus.STORED
