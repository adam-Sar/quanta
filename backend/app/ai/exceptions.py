"""AI failures that map to safe HTTP envelopes (Task 7)."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class AIError(ApplicationError):
    """Base error for the AI reasoning layer."""


class InterpretationNotAvailableError(AIError):
    """Raised when no profile or findings are available to interpret."""

    def __init__(self) -> None:
        super().__init__(
            code="interpretation_not_available",
            message="No profile or findings are available to interpret.",
            status_code=HTTPStatus.CONFLICT,
        )


class ProviderError(AIError):
    """Raised when the configured LLM provider fails or returns garbage."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            code="ai_provider_error",
            message="The AI provider failed to produce a valid interpretation.",
            status_code=HTTPStatus.BAD_GATEWAY,
            details={"reason": reason},
        )


__all__ = [
    "AIError",
    "InterpretationNotAvailableError",
    "ProviderError",
]
