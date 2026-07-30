"""Recommendation failures that map to safe HTTP envelopes (Task 8)."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class RecommendationError(ApplicationError):
    """Base error for the recommendations layer."""


class RecommendationsNotAvailableError(RecommendationError):
    """Raised when no profile or findings are available to recommend against."""

    def __init__(self) -> None:
        super().__init__(
            code="recommendations_not_available",
            message="No profile or findings are available to recommend against.",
            status_code=HTTPStatus.CONFLICT,
        )


class RecommendationNotFoundError(RecommendationError):
    """Raised when a specific recommendation row does not exist."""

    def __init__(self, recommendation_id: object) -> None:
        super().__init__(
            code="recommendation_not_found",
            message="The requested recommendation does not exist.",
            status_code=HTTPStatus.NOT_FOUND,
            details={"recommendation_id": str(recommendation_id)},
        )


class InvalidRecommendationStateError(RecommendationError):
    """Raised when the persisted state is incompatible with the recommendation run."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_recommendation_state",
            message="Recommendations cannot be produced in the current dataset state.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )


__all__ = [
    "InvalidRecommendationStateError",
    "RecommendationError",
    "RecommendationNotFoundError",
    "RecommendationsNotAvailableError",
]
