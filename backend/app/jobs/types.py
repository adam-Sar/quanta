"""Job domain types (Task 10)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

# Documented schema version. Bump when the job payload shape or
# the runner changes in a non-backward-compatible way.
JOB_FORMULA_VERSION: str = "task10-1.0"


class JobKind(StrEnum):
    """The Task 10 supported job kinds.

    Each value maps 1:1 to one of the existing Task 2-9 analysis
    operations. The runner dispatches on the kind to the appropriate
    service method.
    """

    PROFILE = "profile"
    DETECT = "detect"
    SCORE = "score"
    HISTORY = "history"
    RECOMMENDATIONS = "recommendations"
    VALIDATIONS = "validations"


class JobStatus(StrEnum):
    """The deterministic lifecycle of a job."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class Job:
    """A durable analysis job record (Task 10)."""

    job_id: UUID
    dataset_id: UUID
    profile_id: UUID | None
    kind: JobKind
    status: JobStatus
    title: str
    parameters: dict[str, Any] = field(default_factory=dict)
    result: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] = field(default_factory=dict)
    formula_version: str = JOB_FORMULA_VERSION
    created_at: datetime = field(
        default_factory=lambda: datetime.now(__import__("datetime").timezone.utc)
    )
    started_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class JobRequest:
    """Inputs the jobs service consumes."""

    dataset_id: UUID
    kind: JobKind
    profile_id: UUID | None = None
    parameters: dict[str, Any] = field(default_factory=dict)


__all__ = [
    "JOB_FORMULA_VERSION",
    "Job",
    "JobKind",
    "JobRequest",
    "JobStatus",
]