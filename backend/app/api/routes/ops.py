"""Operator-facing ops routes (Task 11).

* ``GET /metrics`` returns the in-process ``RequestMetricsRecorder``
  snapshot (count, total/avg/min/max duration, by-status / by-path
  counts, and the bounded recent-observation list).
* ``GET /limits`` returns the active operator-facing limits so the
  frontend can render a "what's the API enforcing right now" page
  without having to parse env vars.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.metrics import RECORDER

router = APIRouter(tags=["ops"])


@router.get(
    "/metrics",
    summary="In-process request metrics",
    operation_id="get_metrics",
)
def get_metrics() -> dict:
    """Return the bounded recent-request ring buffer and aggregate."""

    return RECORDER.to_payload()


@router.get(
    "/limits",
    summary="Operator-facing request limits",
    operation_id="get_limits",
)
def get_limits(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    """Return the active rate-limit / size / budget caps."""

    return {
        "rate_limit_capacity": settings.rate_limit_capacity,
        "rate_limit_window_seconds": settings.rate_limit_window_seconds,
        "max_request_bytes": settings.max_request_bytes,
        "max_upload_size_bytes": settings.max_upload_size_bytes,
        "request_budget_ms": settings.request_budget_ms,
        "metrics_buffer_capacity": settings.metrics_buffer_capacity,
    }


__all__ = ["get_limits", "get_metrics", "router"]
