"""In-memory sliding-window rate limiter (Task 11).

A bounded, thread-safe counter keyed by ``(client_key, scope)`` that
enforces a max number of calls inside a rolling time window. The
limiter is in-process only and resets when the process restarts; this
is sufficient for the local-development and single-node deployment
shapes documented in ``backend.md``. A future task may replace this
with a Redis-backed implementation without changing the call site.

The limiter deliberately avoids any clock math beyond
``time.monotonic_ns`` so it is unaffected by wall-clock skew and
survives system suspend cleanly.
"""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass
from time import monotonic_ns
from typing import Final

NANOS_PER_SECOND: Final[int] = 1_000_000_000


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    """Outcome of a single rate-limit check."""

    allowed: bool
    retry_after_seconds: int
    used: int
    capacity: int
    scope: str


class SlidingWindowRateLimiter:
    """A thread-safe sliding-window counter.

    Each call to ``check`` records the current timestamp in a deque
    keyed by ``(client_key, scope)``. Old timestamps older than the
    window are evicted before counting. ``capacity`` calls per
    ``window_seconds`` are allowed per key.
    """

    def __init__(self, *, capacity: int, window_seconds: float) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be > 0")
        self._capacity = capacity
        self._window_ns = int(window_seconds * NANOS_PER_SECOND)
        self._buckets: dict[tuple[str, str], deque[int]] = {}
        self._lock = threading.Lock()

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def window_seconds(self) -> float:
        return self._window_ns / NANOS_PER_SECOND

    def _evict(self, timestamps: deque[int], now_ns: int) -> None:
        """Drop timestamps that fell out of the window (in-place)."""

        cutoff = now_ns - self._window_ns
        while timestamps and timestamps[0] <= cutoff:
            timestamps.popleft()

    def check(self, client_key: str, scope: str) -> RateLimitDecision:
        """Atomically evaluate and update the rate-limit decision."""

        key = (client_key, scope)
        now = monotonic_ns()
        with self._lock:
            timestamps = self._buckets.get(key)
            if timestamps is None:
                timestamps = deque()
                self._buckets[key] = timestamps
            self._evict(timestamps, now)
            if len(timestamps) >= self._capacity:
                oldest = timestamps[0]
                retry_after_ns = (oldest + self._window_ns) - now
                retry_after_seconds = max(1, -(-retry_after_ns // NANOS_PER_SECOND))
                return RateLimitDecision(
                    allowed=False,
                    retry_after_seconds=int(retry_after_seconds),
                    used=len(timestamps),
                    capacity=self._capacity,
                    scope=scope,
                )
            timestamps.append(now)
            return RateLimitDecision(
                allowed=True,
                retry_after_seconds=0,
                used=len(timestamps),
                capacity=self._capacity,
                scope=scope,
            )

    def reset(self) -> None:
        """Clear all stored buckets. Test-only convenience."""

        with self._lock:
            self._buckets.clear()

    def used(self, client_key: str, scope: str) -> int:
        """Return the current usage for a key without recording a new call."""

        now = monotonic_ns()
        with self._lock:
            timestamps = self._buckets.get((client_key, scope))
            if timestamps is None:
                return 0
            self._evict(timestamps, now)
            return len(timestamps)


__all__ = [
    "NANOS_PER_SECOND",
    "RateLimitDecision",
    "SlidingWindowRateLimiter",
]
