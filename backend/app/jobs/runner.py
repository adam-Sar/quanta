"""Job execution dispatcher (Task 10).

The runner maps a ``JobKind`` to one of the existing Task 2-9
service methods and produces a ``(status, result, error)`` tuple.
It is **synchronous** in Task 10: the request handler runs the
pipeline inline and persists the outcome. The Task 11 hardening
task may introduce a real worker, but Task 10 deliberately keeps
the implementation boring and deterministic.

The runner never mutates the original file. It consumes the
immutable upstream rows (Task 2-9) and lets the wrapped services
persist their own immutable rows in their own single transactions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.detection.service import DetectionService
from app.history.service import HistoryService
from app.jobs.exceptions import InvalidJobStateError
from app.jobs.types import JobKind, JobStatus
from app.profiling.service import ProfilingService
from app.recommendations.service import RecommendationService
from app.scoring.service import ScoringService
from app.services.exceptions import DatasetNotFoundError
from app.validation.service import ValidationService


@dataclass(frozen=True, slots=True)
class JobOutcome:
    """The structured outcome of a single runner invocation."""

    status: JobStatus
    result: dict[str, Any]
    error: dict[str, Any]
    profile_id: UUID | None = None


def _to_payload(value: Any) -> Any:
    """Convert a domain object into a JSON-safe primitive for the result payload."""

    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_to_payload(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _to_payload(item) for key, item in value.items()}
    return str(value)


def _outcome(
    *,
    status: JobStatus,
    result: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
    profile_id: UUID | None = None,
) -> JobOutcome:
    return JobOutcome(
        status=status,
        result=dict(result or {}),
        error=dict(error or {}),
        profile_id=profile_id,
    )


def run_job(
    job_kind: JobKind,
    *,
    dataset_id: UUID,
    profile_id: UUID | None,
    parameters: dict[str, Any],
    profiling_service: ProfilingService,
    detection_service: DetectionService,
    scoring_service: ScoringService,
    history_service: HistoryService,
    recommendation_service: RecommendationService,
    validation_service: ValidationService,
) -> JobOutcome:
    """Dispatch one ``JobKind`` to the matching Task 2-9 service method.

    Returns a structured ``JobOutcome`` that the service layer turns
    into a Job row update. Catches ``ApplicationError``-like exceptions
    raised by the wrapped services and translates them into a
    ``failed`` outcome with a JSON-safe ``error`` payload; any
    unexpected exception is re-raised so the caller can roll back the
    transaction cleanly.
    """

    # Local import keeps the module light and avoids a circular
    # import: ``JobService`` imports the runner, and the runner only
    # needs the exception classes when actually running.
    from app.core.exceptions import ApplicationError

    try:
        if job_kind is JobKind.PROFILE:
            profile = profiling_service.profile_latest_version(dataset_id)
            return _outcome(
                status=JobStatus.SUCCEEDED,
                result={
                    "profile_id": str(profile.id),
                    "dataset_id": str(profile.dataset_id),
                    "dataset_version_id": str(profile.dataset_version_id),
                    "sample_size": int(profile.sample_size),
                },
                profile_id=profile.id,
            )
        if job_kind is JobKind.DETECT:
            findings = detection_service.detect_latest(dataset_id)
            profile_id = (
                findings[0].profile_id if findings else profile_id
            )
            return _outcome(
                status=JobStatus.SUCCEEDED,
                result={
                    "finding_count": len(findings),
                    "finding_ids": [str(item.id) for item in findings],
                },
                profile_id=profile_id,
            )
        if job_kind is JobKind.SCORE:
            score = scoring_service.score_latest(dataset_id)
            return _outcome(
                status=JobStatus.SUCCEEDED,
                result={
                    "score_id": str(score.id),
                    "dataset_id": str(score.dataset_id),
                    "dataset_version_id": str(score.dataset_version_id),
                    "profile_id": str(score.profile_id),
                    "score": float(score.score),
                    "grade": score.grade.value
                    if hasattr(score.grade, "value")
                    else score.grade,
                    "finding_count": int(score.finding_count),
                },
                profile_id=score.profile_id,
            )
        if job_kind is JobKind.HISTORY:
            base_version_id = parameters.get("base_version_id")
            target_version_id = parameters.get("target_version_id")
            if not isinstance(base_version_id, str) or not isinstance(
                target_version_id, str
            ):
                raise InvalidJobStateError(
                    "history job requires base_version_id and target_version_id"
                )
            comparison = history_service.compare_versions(
                dataset_id=dataset_id,
                base_version_id=UUID(base_version_id),
                target_version_id=UUID(target_version_id),
            )
            return _outcome(
                status=JobStatus.SUCCEEDED,
                result={
                    "comparison_id": str(comparison.id),
                    "base_version_id": str(comparison.base_version_id),
                    "target_version_id": str(comparison.target_version_id),
                    "has_drift": bool(
                        comparison.score_drift.get("grade_changed", False)
                    )
                    or bool(comparison.schema_diff.get("added"))
                    or bool(comparison.schema_diff.get("removed"))
                    or bool(comparison.schema_diff.get("type_changes")),
                },
            )
        if job_kind is JobKind.RECOMMENDATIONS:
            rows = recommendation_service.recommend(dataset_id)
            return _outcome(
                status=JobStatus.SUCCEEDED,
                result={
                    "count": len(rows),
                    "recommendation_ids": [str(item.id) for item in rows],
                },
                profile_id=rows[0].profile_id if rows else profile_id,
            )
        if job_kind is JobKind.VALIDATIONS:
            recommendation_id = parameters.get("recommendation_id")
            if not isinstance(recommendation_id, str):
                raise InvalidJobStateError(
                    "validations job requires recommendation_id"
                )
            row = validation_service.validate_recommendation(
                UUID(recommendation_id)
            )
            return _outcome(
                status=JobStatus.SUCCEEDED,
                result={
                    "validation_id": str(row.id),
                    "recommendation_id": str(row.recommendation_id),
                    "operation_kind": row.operation_kind,
                    "status": row.status,
                },
            )
        raise InvalidJobStateError(f"unsupported job kind: {job_kind!r}")
    except ApplicationError as exc:
        return _outcome(
            status=JobStatus.FAILED,
            error={
                "code": getattr(exc, "code", "internal_error"),
                "message": getattr(exc, "message", str(exc)),
                "details": _to_payload(getattr(exc, "details", None)),
            },
            profile_id=profile_id,
        )
    except DatasetNotFoundError as exc:
        # ``DatasetNotFoundError`` inherits from ``ApplicationError`` in
        # practice; the explicit branch keeps the runner robust if a
        # future refactor moves the base class.
        return _outcome(
            status=JobStatus.FAILED,
            error={
                "code": getattr(exc, "code", "dataset_not_found"),
                "message": getattr(exc, "message", str(exc)),
                "details": _to_payload(getattr(exc, "details", None)),
            },
            profile_id=profile_id,
        )


__all__ = ["JobOutcome", "run_job"]
