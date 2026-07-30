"""Scoring failures that map to safe HTTP envelopes (Task 5)."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class ScoringError(ApplicationError):
    """Base error for the scoring layer."""


class ScoringNotProfileableError(ScoringError):
    """Raised when scoring cannot run yet (no detection batch exists)."""

    def __init__(self) -> None:
        super().__init__(
            code="scoring_not_scoreable",
            message="No detection batch is available to score against.",
            status_code=HTTPStatus.CONFLICT,
        )


class InvalidScoringStateError(ScoringError):
    """Raised when the persisted state is incompatible with scoring."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_scoring_state",
            message="The detection batch cannot be scored in its current state.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )


__all__ = [
    "InvalidScoringStateError",
    "ScoringError",
    "ScoringNotProfileableError",
]
