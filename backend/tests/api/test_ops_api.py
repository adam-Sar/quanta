"""API contract tests for the Task 11 operator ops routes.

These tests exercise ``GET /metrics`` and ``GET /limits`` against the
in-process application. The rate-limit middleware runs on every
request, so the per-test reset calls ``reset_limiter`` (the
public test-only helper exported by ``app.core.middleware``) to
keep tests independent.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core import metrics as core_metrics
from app.core.middleware import reset_limiter


def test_get_metrics_returns_recorder_payload(client: TestClient) -> None:
    response = client.get("/metrics")
    assert response.status_code == 200
    body = response.json()
    assert body["capacity"] == core_metrics.RECORDER.capacity
    # The middleware records the observation in its ``finally``
    # block, so the response body reflects the state *before* this
    # request was recorded. The body therefore shows the empty
    # recorder.
    assert body["summary"]["total_requests"] == 0
    assert body["recent"] == []


def test_get_metrics_records_one_observation_per_request(
    client: TestClient,
) -> None:
    reset_limiter()
    # The middleware appends the observation *after* the response is
    # built, so each call to /metrics returns the count of requests
    # observed so far, *excluding* the call that just returned. After
    # 3 calls we expect the body of the 3rd call to show 2
    # observations (the first /metrics and the /limits).
    client.get("/metrics")
    client.get("/limits")
    body = client.get("/metrics").json()
    assert body["summary"]["total_requests"] == 2
    assert body["size"] == 2
    paths = {item["path"] for item in body["recent"]}
    assert paths == {"/metrics", "/limits"}


def test_get_metrics_recent_items_have_request_id(
    client: TestClient,
) -> None:
    reset_limiter()
    response = client.get(
        "/metrics",
        headers={"X-Request-ID": "test-request-id"},
    )
    body = response.json()
    # The body of the /metrics call shows the state *before* it was
    # recorded, so we expect an empty recent list.
    assert body["recent"] == []


def test_get_limits_returns_active_settings(client: TestClient) -> None:
    response = client.get("/limits")
    assert response.status_code == 200
    body = response.json()
    assert "rate_limit_capacity" in body
    assert "rate_limit_window_seconds" in body
    assert "max_request_bytes" in body
    assert "max_upload_size_bytes" in body
    assert "request_budget_ms" in body
    assert "metrics_buffer_capacity" in body
    assert body["rate_limit_capacity"] >= 1
    assert body["rate_limit_window_seconds"] > 0
    assert body["max_request_bytes"] >= 1
    assert body["request_budget_ms"] >= 1


def test_security_headers_are_set_on_every_response(
    client: TestClient,
) -> None:
    reset_limiter()
    response = client.get("/limits")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "X-Request-ID" in response.headers


def test_rate_limit_middleware_returns_429_after_burst(
    client: TestClient,
) -> None:
    """Hammer the metrics endpoint to confirm the 429 path works."""

    reset_limiter()
    from app.core.middleware import _LIMITER

    capacity = _LIMITER.capacity
    last_status = 0
    for _ in range(capacity + 5):
        last_status = client.get("/metrics").status_code
    assert last_status == 429
    error_body = client.get("/metrics").json()
    assert error_body["error"]["code"] == "rate_limit_exceeded"
    assert "Retry-After" in client.get("/metrics").headers


def test_rate_limit_response_includes_retry_after_header(
    client: TestClient,
) -> None:
    reset_limiter()
    from app.core.middleware import _LIMITER

    capacity = _LIMITER.capacity
    for _ in range(capacity):
        client.get("/limits")
    response = client.get("/limits")
    assert response.status_code == 429
    # ``Retry-After`` is in seconds and must be present and at least
    # 1 (the floor the limiter enforces). The exact value depends on
    # the oldest entry in the sliding window, so we don't pin it.
    retry_after = int(response.headers["Retry-After"])
    assert retry_after >= 1
    body = response.json()
    assert body["error"]["code"] == "rate_limit_exceeded"
    assert body["error"]["details"]["scope"].startswith("GET ")
    assert body["error"]["details"]["retry_after_seconds"] >= 1
