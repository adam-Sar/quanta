"""Unit tests for the Task 7 AI reasoning layer.

Covers the deterministic ``NoopProvider`` plus the
``ReasoningService`` orchestration against an in-memory SQLite
database seeded with the Task 2-4 artifacts the AI layer consumes.
"""

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

from app.ai.prompts import (
    InterpretationResponseSchema,
    build_interpretation_prompt,
)
from app.ai.providers.noop import NoopProvider
from app.ai.service import ReasoningService
from app.core.config import Settings
from app.db.base import Base
from app.db.models.dataset import Dataset, DatasetVersion
from app.db.models.finding import Finding
from app.db.models.history_comparison import (
    HistoryComparison,  # noqa: F401  (ensure table registered)
)
from app.db.models.profile import ColumnProfile, DatasetProfile
from app.db.models.quality_score import QualityScore  # noqa: F401
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.detection.types import FindingKind, FindingSeverity
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
def session_factory() -> Iterator[sessionmaker[Session]]:
    engine, factory = _create_sqlite_engine()
    yield factory
    engine.dispose()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        app_name="AI Service Tests",
        environment="test",
        log_format="console",
        database_url="postgresql+psycopg://test:test@localhost:5432/quanta_test",
        storage_path=tmp_path / "storage",
    )


@pytest.fixture
def session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    sess = session_factory()
    try:
        yield sess
    finally:
        sess.close()


def _seed_dataset_with_findings(
    session: Session, settings: Settings, storage: LocalFileStorage
) -> tuple[UUID, UUID]:
    service = DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=storage,
        validator=DatasetFileValidator(),
        readers=MetadataReaderRegistry(
            {
                DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
                DatasetFormat.PARQUET: ParquetMetadataReader(),
            }
        ),
        settings=settings,
    )
    upload = UploadFile(  # type: ignore[arg-type]
        file=io.BytesIO(b"id,name\n1,alice\n2,bob\n"),
        filename="people.csv",
    )
    service.ingest(upload=upload, name="people", description=None)
    session.commit()
    dataset = session.query(Dataset).one()
    version = session.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset.id).one()
    profile = DatasetProfile(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        sample_size=2,
        sampled="full",
        duration_ms=1,
    )
    session.add(profile)
    session.flush()
    for column_name in ("id", "name"):
        column = next(c for c in version.columns if c.name == column_name)
        session.add(
            ColumnProfile(
                dataset_profile_id=profile.id,
                name=column.name,
                ordinal_position=column.ordinal_position,
                metrics={
                    "physical_type": column.physical_type,
                    "sample_size": 2,
                    "non_null_count": 2,
                    "null_count": 0,
                    "null_rate": 0.0,
                    "distinct_count": 2,
                    "distinct_rate": 1.0,
                    "top_values": [],
                    "numeric": {
                        "min": 1.0,
                        "max": 2.0,
                        "mean": 1.5,
                        "median": 1.5,
                        "std": 0.5,
                        "sum": 3.0,
                    },
                    "temporal": {"min": None, "max": None},
                    "string_length": {"min": None, "max": None, "mean": None},
                },
            )
        )
    for column_name in ("id", "name"):
        column = next(c for c in version.columns if c.name == column_name)
        session.add(
            Finding(
                dataset_id=dataset.id,
                dataset_version_id=version.id,
                profile_id=profile.id,
                kind=FindingKind.MISSINGNESS.value,
                severity=FindingSeverity.MEDIUM.value,
                column_name=column.name,
                metric="null_rate",
                value=0.5,
                threshold=0.1,
                description=f"null rate for {column.name}",
                details={},
            )
        )
    session.commit()
    return dataset.id, profile.id


@pytest.fixture
def reasoning_service(session: Session, settings: Settings) -> ReasoningService:
    return ReasoningService(
        session=session,
        repository=AIInterpretationRepository(session),
        provider=NoopProvider(),
        settings=settings,
    )


def test_noop_provider_returns_schema_valid_response() -> None:
    provider = NoopProvider()
    response = provider.complete(
        prompt="noop-interpret dataset=people profile=p",
        response_model=InterpretationResponseSchema,
        context={"dataset_name": "people", "findings": []},
    )
    assert isinstance(response, InterpretationResponseSchema)
    assert response.overall_confidence == 0.0
    assert response.hypotheses == []
    assert "NoopProvider" in response.summary


def test_noop_provider_builds_placeholder_hypotheses() -> None:
    provider = NoopProvider()
    response = provider.complete(
        prompt="noop",
        response_model=InterpretationResponseSchema,
        context={
            "dataset_name": "people",
            "findings": [
                {
                    "finding_id": "f1",
                    "kind": "missingness",
                    "severity": "medium",
                    "column": "id",
                    "value": 0.5,
                    "threshold": 0.1,
                    "summary": "n/a",
                }
            ],
        },
    )
    assert len(response.hypotheses) == 1  # type: ignore[attr-defined]
    assert response.hypotheses[0].category.value == "data_quality"  # type: ignore[attr-defined]
    assert response.hypotheses[0].confidence == 0.1  # type: ignore[attr-defined]


def test_noop_provider_rejects_other_response_models() -> None:
    class OtherModel:
        pass

    provider = NoopProvider()
    with pytest.raises(ValueError):
        provider.complete(
            prompt="noop",
            response_model=OtherModel,  # type: ignore[arg-type]
            context={},
        )


def test_build_interpretation_prompt_includes_finding_context() -> None:
    prompt = build_interpretation_prompt(
        dataset_name="people",
        profile_id="p-1",
        score=82.5,
        grade="B",
        findings=[
            {
                "finding_id": "f-1",
                "kind": "missingness",
                "severity": "high",
                "column": "email",
                "value": 0.62,
                "threshold": 0.5,
                "summary": "n/a",
            }
        ],
    )
    assert "missingness" in prompt
    assert "high" in prompt
    assert "email" in prompt
    assert "0.62" in prompt
    assert "82.5" in prompt
    assert "B" in prompt


def test_build_interpretation_prompt_handles_no_findings() -> None:
    prompt = build_interpretation_prompt(
        dataset_name="people",
        profile_id="p-1",
        score=None,
        grade=None,
        findings=[],
    )
    assert "finding_count: 0" in prompt
    assert "current_score: unknown" in prompt


def test_reasoning_service_persists_noop_interpretation(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, profile_id = _seed_dataset_with_findings(session, settings, storage)
    service = ReasoningService(
        session=session,
        repository=AIInterpretationRepository(session),
        provider=NoopProvider(),
        settings=settings,
    )
    row = service.interpret(dataset_id)

    assert row.dataset_id == dataset_id
    assert row.profile_id == profile_id
    assert row.provider_name == "noop"
    assert row.formula_version == "task7-1.0"
    assert row.summary
    assert isinstance(row.hypotheses, list)
    assert row.input_finding_ids  # type-converted list of strings


def test_reasoning_service_raises_without_dataset(
    session: Session,
    settings: Settings,
) -> None:
    service = ReasoningService(
        session=session,
        repository=AIInterpretationRepository(session),
        provider=NoopProvider(),
        settings=settings,
    )
    with pytest.raises(DatasetNotFoundError.__mro__[1]):
        service.interpret(uuid4())


def test_reasoning_service_raises_without_findings(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    ingestion = DatasetService(
        session=session,
        repository=DatasetRepository(session),
        storage=storage,
        validator=DatasetFileValidator(),
        readers=MetadataReaderRegistry(
            {
                DatasetFormat.CSV: CsvMetadataReader(settings.csv_infer_schema_length),
                DatasetFormat.PARQUET: ParquetMetadataReader(),
            }
        ),
        settings=settings,
    )
    upload = UploadFile(  # type: ignore[arg-type]
        file=io.BytesIO(b"id,name\n1,alice\n2,bob\n"),
        filename="people.csv",
    )
    ingestion.ingest(upload=upload, name="people", description=None)
    session.commit()
    dataset = session.query(Dataset).one()
    version = session.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset.id).one()
    profile = DatasetProfile(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        sample_size=2,
        sampled="full",
        duration_ms=1,
    )
    session.add(profile)
    session.commit()
    reasoning = ReasoningService(
        session=session,
        repository=AIInterpretationRepository(session),
        provider=NoopProvider(),
        settings=settings,
    )
    from app.ai.exceptions import InterpretationNotAvailableError

    with pytest.raises(InterpretationNotAvailableError):
        reasoning.interpret(dataset.id)


def test_reasoning_service_list_for_dataset_paginates(
    session: Session,
    settings: Settings,
) -> None:
    storage = LocalFileStorage(settings.storage_path)
    dataset_id, _ = _seed_dataset_with_findings(session, settings, storage)
    service = ReasoningService(
        session=session,
        repository=AIInterpretationRepository(session),
        provider=NoopProvider(),
        settings=settings,
    )
    for _ in range(3):
        service.interpret(dataset_id)
    items, total = service.list_for_dataset(dataset_id, offset=0, limit=2)
    assert total == 3
    assert len(items) == 2
    items_rest, total_rest = service.list_for_dataset(dataset_id, offset=2, limit=2)
    assert total_rest == 3
    assert len(items_rest) == 1
