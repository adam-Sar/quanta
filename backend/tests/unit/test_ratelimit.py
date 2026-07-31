"""Unit tests for the Task 11 in-memory sliding-window rate limiter."""

from __future__ import annotations

import time

import pytest

from app.core.ratelimit import (
    NANOS_PER_SECOND,
    RateLimitDecision,
    SlidingWindowRateLimiter,
)


def test_rate_limiter_rejects_invalid_constructor_args() -> None:
    with pytest.raises(ValueError, match="capacity"):
        SlidingWindowRateLimiter(capacity=0, window_seconds=1.0)
    with pytest.raises(ValueError, match="window_seconds"):
        SlidingWindowRateLimiter(capacity=1, window_seconds=0.0)
    with pytest.raises(ValueError, match="window_seconds"):
        SlidingWindowRateLimiter(capacity=1, window_seconds=-1.0)


def test_rate_limiter_allows_calls_within_capacity() -> None:
    limiter = SlidingWindowRateLimiter(capacity=3, window_seconds=1.0)
    decisions = [limiter.check("client-a", "scope-x") for _ in range(3)]
    assert all(decision.allowed for decision in decisions)
    assert all(isinstance(decision, RateLimitDecision) for decision in decisions)
    assert [decision.used for decision in decisions] == [1, 2, 3]


def test_rate_limiter_rejects_after_capacity() -> None:
    limiter = SlidingWindowRateLimiter(capacity=2, window_seconds=1.0)
    assert limiter.check("c", "s").allowed
    assert limiter.check("c", "s").allowed
    decision = limiter.check("c", "s")
    assert decision.allowed is False
    assert decision.retry_after_seconds >= 1
    assert decision.scope == "s"
    assert decision.used == 2
    assert decision.capacity == 2


def test_rate_limiter_isolates_clients_and_scopes() -> None:
    limiter = SlidingWindowRateLimiter(capacity=1, window_seconds=1.0)
    assert limiter.check("client-a", "scope-x").allowed
    assert limiter.check("client-b", "scope-x").allowed
    assert limiter.check("client-a", "scope-y").allowed
    assert not limiter.check("client-a", "scope-x").allowed


def test_rate_limiter_window_resets() -> None:
    limiter = SlidingWindowRateLimiter(capacity=1, window_seconds=0.05)
    assert limiter.check("c", "s").allowed
    assert not limiter.check("c", "s").allowed
    time.sleep(0.06)
    assert limiter.check("c", "s").allowed


def test_rate_limiter_used_does_not_record_call() -> None:
    limiter = SlidingWindowRateLimiter(capacity=2, window_seconds=1.0)
    limiter.check("c", "s")
    assert limiter.used("c", "s") == 1
    assert limiter.used("c", "s") == 1
    assert limiter.used("c", "s") == 1


def test_rate_limiter_reset_clears_buckets() -> None:
    limiter = SlidingWindowRateLimiter(capacity=1, window_seconds=10.0)
    limiter.check("c", "s")
    assert limiter.used("c", "s") == 1
    limiter.reset()
    assert limiter.used("c", "s") == 0


def test_rate_limiter_nanos_per_second_constant() -> None:
    assert NANOS_PER_SECOND == 1_000_000_000
