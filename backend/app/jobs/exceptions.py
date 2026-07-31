"""Job failures that map to safe HTTP envelopes (Task 10)."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class JobError(ApplicationError):
    """Base error for the jobs layer."""


class JobNotFoundError(JobError):
    """Raised when a specific job row does not exist."""

    def __init__(self, job_id: object) -> None:
        super().__init__(
            code="job_not_found",
            message="The requested analysis job does not exist.",
            status_code=HTTPStatus.NOT_FOUND,
            details={"job_id": str(job_id)},
        )


class InvalidJobStateError(JobError):
    """Raised when a job cannot be executed in its current state."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_job_state",
            message="The analysis job cannot be executed in its current state.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )


__all__ = ["InvalidJobStateError", "JobError", "JobNotFoundError"]