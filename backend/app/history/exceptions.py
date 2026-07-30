"""History failures that map to safe HTTP envelopes (Task 6)."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class HistoryError(ApplicationError):
    """Base error for the history layer."""


class VersionNotFoundError(HistoryError):
    """Raised when a referenced dataset_version does not exist."""

    def __init__(self, version_id: object) -> None:
        super().__init__(
            code="version_not_found",
            message="The requested dataset version does not exist.",
            status_code=HTTPStatus.NOT_FOUND,
            details={"version_id": str(version_id)},
        )


class SameVersionComparisonError(HistoryError):
    """Raised when a comparison is requested against the same version."""

    def __init__(self) -> None:
        super().__init__(
            code="same_version_comparison",
            message="Cannot compare a dataset version against itself.",
            status_code=HTTPStatus.BAD_REQUEST,
        )


__all__ = [
    "HistoryError",
    "SameVersionComparisonError",
    "VersionNotFoundError",
]
