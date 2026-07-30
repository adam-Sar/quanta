"""Dependency composition for HTTP-facing application services."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.ai.providers.noop import NoopProvider
from app.ai.service import ReasoningService
from app.core.config import Settings, get_settings
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.datasets import DatasetRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.history_comparisons import HistoryComparisonRepository
from app.db.repositories.profiles import ProfileRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.db.session import get_db
from app.detection.service import DetectionService
from app.history.service import HistoryService
from app.ingestion.readers import CsvMetadataReader, MetadataReaderRegistry, ParquetMetadataReader
from app.ingestion.types import DatasetFormat
from app.ingestion.validators import DatasetFileValidator
from app.profiling.metrics import DatasetProfiler
from app.profiling.service import ProfilingService
from app.recommendations.service import RecommendationService
from app.scoring.service import ScoringService
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


def get_detection_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DetectionService:
    """Compose the Task 4 detection service with persistence."""

    return DetectionService(
        session=session,
        repository=FindingRepository(session),
        profile_repository=ProfileRepository(session),
        settings=settings,
    )


def get_scoring_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ScoringService:
    """Compose the Task 5 scoring service with persistence."""

    return ScoringService(
        session=session,
        repository=QualityScoreRepository(session),
        finding_repository=FindingRepository(session),
        settings=settings,
    )


def get_history_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> HistoryService:
    """Compose the Task 6 history service with persistence."""

    return HistoryService(
        session=session,
        repository=HistoryComparisonRepository(session),
        settings=settings,
    )


def get_reasoning_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ReasoningService:
    """Compose the Task 7 AI reasoning service with persistence."""

    return ReasoningService(
        session=session,
        repository=AIInterpretationRepository(session),
        provider=NoopProvider(),
        settings=settings,
    )


def get_recommendation_service(
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RecommendationService:
    """Compose the Task 8 deterministic recommendation service with persistence."""

    return RecommendationService(
        session=session,
        repository=RecommendationRepository(session),
        finding_repository=FindingRepository(session),
        score_repository=QualityScoreRepository(session),
        interpretation_repository=AIInterpretationRepository(session),
        settings=settings,
    )