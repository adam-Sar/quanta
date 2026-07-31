"""Validation failures that map to safe HTTP envelopes (Task 9)."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class ValidationError(ApplicationError):
    """Base error for the validation layer."""


class ValidationNotFoundError(ValidationError):
    """Raised when a specific validation row does not exist."""

    def __init__(self, validation_id: object) -> None:
        super().__init__(
            code="validation_not_found",
            message="The requested validation does not exist.",
            status_code=HTTPStatus.NOT_FOUND,
            details={"validation_id": str(validation_id)},
        )


class InvalidValidationStateError(ValidationError):
    """Raised when the persisted state is incompatible with a validation run."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_validation_state",
            message="The validation cannot be produced in the current dataset state.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )


__all__ = [
    "InvalidValidationStateError",
    "ValidationError",
    "ValidationNotFoundError",
]