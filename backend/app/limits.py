"""Pure helpers for enforcing operator-facing limits (Task 11).

Routes that accept a JSON or file body (e.g. dataset ingest and job
dispatch) call ``enforce_max_request_bytes`` after reading the
request body. The helper raises the standard
``RequestTooLargeError`` when the body exceeds the operator cap, so
the existing error envelope produces a 413 with a sanitized
``observed_bytes`` / ``limit_bytes`` payload.
"""

from __future__ import annotations

from app.core.config import Settings
from app.core.exceptions import RequestTooLargeError


def enforce_max_request_bytes(settings: Settings, observed_bytes: int) -> None:
    """Raise :class:`RequestTooLargeError` when the body exceeds the cap."""

    if observed_bytes > settings.max_request_bytes:
        raise RequestTooLargeError(
            observed_bytes=observed_bytes,
            limit_bytes=settings.max_request_bytes,
        )


__all__ = ["enforce_max_request_bytes"]
