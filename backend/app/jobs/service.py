"""Job orchestration (Task 10).

The service creates a ``Job`` row in ``pending`` status, runs the
pipeline inline through ``run_job``, updates the row to ``running``
then ``succeeded`` / ``failed``, and exposes ``get_job`` /
``list_for_dataset``. Job execution is **synchronous** in Task 10;
the Task 11 hardening task may introduce a real worker.

The service never mutates the original file. It delegates every
``JobKind`` to the corresponding Task 2-9 service which owns its
own single-transaction persistence.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.dataset import DatasetVersion
from app.db.models.job import Job as JobModel
from app.db.repositories.jobs import JobRepository
from app.detection.service import DetectionService
from app.history.service import HistoryService
from app.jobs.exceptions import JobNotFoundError
from app.jobs.runner import run_job
from app.jobs.types import (
    JOB_FORMULA_VERSION,
    Job,
    JobKind,
    JobRequest,
    JobStatus,
)
from app.profiling.service import ProfilingService
from app.recommendations.service import RecommendationService
from app.scoring.service import ScoringService
from app.services.exceptions import DatasetNotFoundError
from app.validation.service import ValidationService

logger = logging.getLogger(__name__)


class JobService:
    """Create, run, and query durable analysis jobs."""

    def __init__(
        self,
        *,
        session: Session,
        repository: JobRepository,
        profiling_service: ProfilingService,
        detection_service: DetectionService,
        scoring_service: ScoringService,
        history_service: HistoryService,
        recommendation_service: RecommendationService,
        validation_service: ValidationService,
    ) -> None:
        self.session = session
        self.repository = repository
        self.profiling_service = profiling_service
        self.detection_service = detection_service
        self.scoring_service = scoring_service
        self.history_service = history_service
        self.recommendation_service = recommendation_service
        self.validation_service = validation_service

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def run(self, request: JobRequest) -> JobModel:
        """Create a ``pending`` job, run it inline, and persist the outcome."""

        if not self._dataset_exists(request.dataset_id):
            raise DatasetNotFoundError(request.dataset_id)
        title = _default_title(request.kind)
        row = JobModel(
            dataset_id=request.dataset_id,
            profile_id=request.profile_id,
            kind=request.kind.value,
            status=JobStatus.PENDING.value,
            title=title,
            parameters=dict(request.parameters),
            result={},
            error={},
            formula_version=JOB_FORMULA_VERSION,
            created_at=datetime.now(UTC),
        )
        self.repository.add(row)
        try:
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.session.refresh(row)

        row.status = JobStatus.RUNNING.value
        row.started_at = datetime.now(UTC)
        self.session.commit()
        self.session.refresh(row)

        outcome = run_job(
            request.kind,
            dataset_id=request.dataset_id,
            profile_id=request.profile_id,
            parameters=dict(request.parameters),
            profiling_service=self.profiling_service,
            detection_service=self.detection_service,
            scoring_service=self.scoring_service,
            history_service=self.history_service,
            recommendation_service=self.recommendation_service,
            validation_service=self.validation_service,
        )

        row.status = outcome.status.value
        row.result = dict(outcome.result)
        row.error = dict(outcome.error)
        if outcome.profile_id is not None:
            row.profile_id = outcome.profile_id
        row.completed_at = datetime.now(UTC)
        try:
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.session.refresh(row)

        logger.info(
            "job_run_completed",
            extra={
                "job_id": str(row.id),
                "dataset_id": str(row.dataset_id),
                "kind": row.kind,
                "status": row.status,
            },
        )
        return row

    def get_job(self, job_id: UUID) -> JobModel:
        row = self.repository.get(job_id)
        if row is None:
            raise JobNotFoundError(job_id)
        return row

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[JobModel], int]:
        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        items, total = self.repository.list_for_dataset(
            dataset_id, offset=offset, limit=limit
        )
        return list(items), total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        return (
            self.session.scalar(
                select(DatasetVersion.id)
                .where(DatasetVersion.dataset_id == dataset_id)
                .limit(1)
            )
            is not None
        )


def _default_title(kind: JobKind) -> str:
    return {
        JobKind.PROFILE: "Profile dataset version",
        JobKind.DETECT: "Run detection on latest profile",
        JobKind.SCORE: "Score latest detection batch",
        JobKind.HISTORY: "Compare two dataset versions",
        JobKind.RECOMMENDATIONS: "Generate recommendations",
        JobKind.VALIDATIONS: "Run validation preview",
    }.get(kind, "Run analysis job")


def job_to_dict(row: JobModel) -> dict[str, Any]:
    """Render a persisted ``Job`` row to an API-friendly dict."""

    return {
        "job_id": row.id,
        "dataset_id": row.dataset_id,
        "profile_id": row.profile_id,
        "kind": row.kind,
        "status": row.status,
        "title": row.title,
        "parameters": dict(row.parameters or {}),
        "result": dict(row.result or {}),
        "error": dict(row.error or {}),
        "formula_version": row.formula_version,
        "created_at": row.created_at,
        "started_at": row.started_at,
        "completed_at": row.completed_at,
    }


__all__ = ["Job", "JobModel", "JobRequest", "JobService", "job_to_dict"]
