"""Detection failures that map to safe HTTP envelopes."""

from __future__ import annotations

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class DetectionError(ApplicationError):
    """Base error for the detection layer."""


class DetectionNotProfileableError(DetectionError):
    """Raised when detection cannot be run yet (no profile exists)."""

    def __init__(self) -> None:
        super().__init__(
            code="detection_not_profileable",
            message="No profile is available to run detection on.",
            status_code=HTTPStatus.CONFLICT,
        )


class InvalidDetectionStateError(DetectionError):
    """Raised when the persisted profile state is incompatible with detection."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_detection_state",
            message="The profile cannot be used for detection in its current state.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )
