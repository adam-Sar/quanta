"""In-process request metrics (Task 11).

A bounded ring buffer of per-request observations (path, status, method,
duration). The buffer is small, thread-safe, and intended for the
``GET /metrics`` route plus unit tests; it is not a long-term metrics
pipeline (a future task may add Prometheus / OpenTelemetry without
changing the public contract).
"""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field
from time import monotonic_ns
from typing import Any, Final

from app.core.ratelimit import NANOS_PER_SECOND


@dataclass(frozen=True, slots=True)
class RequestObservation:
    """One captured request, normalized to make API responses stable."""

    method: str
    path: str
    status_code: int
    duration_ms: float
    observed_at_ns: int
    request_id: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "method": self.method,
            "path": self.path,
            "status_code": self.status_code,
            "duration_ms": round(self.duration_ms, 3),
            "observed_at": self.observed_at_ns / NANOS_PER_SECOND,
            "request_id": self.request_id,
        }


@dataclass
class _Summary:
    """Running aggregate so ``/metrics`` can return a stable shape."""

    total: int = 0
    sum_ms: float = 0.0
    min_ms: float = float("inf")
    max_ms: float = 0.0
    status_counts: dict[int, int] = field(default_factory=dict)
    path_counts: dict[str, int] = field(default_factory=dict)

    def update(self, observation: RequestObservation) -> None:
        self.total += 1
        self.sum_ms += observation.duration_ms
        if observation.duration_ms < self.min_ms:
            self.min_ms = observation.duration_ms
        if observation.duration_ms > self.max_ms:
            self.max_ms = observation.duration_ms
        self.status_counts[observation.status_code] = (
            self.status_counts.get(observation.status_code, 0) + 1
        )
        self.path_counts[observation.path] = (
            self.path_counts.get(observation.path, 0) + 1
        )

    def to_payload(self) -> dict[str, Any]:
        avg = self.sum_ms / self.total if self.total else 0.0
        min_ms = 0.0 if self.min_ms == float("inf") else self.min_ms
        return {
            "total_requests": self.total,
            "average_ms": round(avg, 3),
            "min_ms": round(min_ms, 3),
            "max_ms": round(self.max_ms, 3),
            "by_status": dict(sorted(self.status_counts.items())),
            "by_path": dict(sorted(self.path_counts.items(), key=lambda item: item[0])),
        }


class RequestMetricsRecorder:
    """Bounded ring buffer + running aggregate."""

    def __init__(self, *, capacity: int = 256) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self._capacity = capacity
        self._buffer: deque[RequestObservation] = deque(maxlen=capacity)
        self._summary = _Summary()
        self._lock = threading.Lock()

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._buffer)

    def record(self, observation: RequestObservation) -> None:
        with self._lock:
            self._buffer.append(observation)
            self._summary.update(observation)

    def snapshot(self) -> tuple[list[RequestObservation], _Summary]:
        """Return a copy of the current buffer + aggregate (test/ops helper)."""

        with self._lock:
            return list(self._buffer), _Summary(
                total=self._summary.total,
                sum_ms=self._summary.sum_ms,
                min_ms=self._summary.min_ms,
                max_ms=self._summary.max_ms,
                status_counts=dict(self._summary.status_counts),
                path_counts=dict(self._summary.path_counts),
            )

    def to_payload(self) -> dict[str, Any]:
        """Return a stable payload for the ``/metrics`` route."""

        recent, summary = self.snapshot()
        return {
            "capacity": self._capacity,
            "size": len(recent),
            "summary": summary.to_payload(),
            "recent": [item.to_payload() for item in recent],
        }

    def reset(self) -> None:
        with self._lock:
            self._buffer.clear()
            self._summary = _Summary()


# Singleton recorder wired through the middleware + ``/metrics`` route.
RECORDER: Final[RequestMetricsRecorder] = RequestMetricsRecorder()
"""Process-wide recorder. ``GET /metrics`` reads this instance."""


def now_monotonic_ns() -> int:
    return monotonic_ns()


__all__ = [
    "RECORDER",
    "RequestMetricsRecorder",
    "RequestObservation",
    "now_monotonic_ns",
]
