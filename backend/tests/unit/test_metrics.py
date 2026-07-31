"""Unit tests for the Task 11 in-process request metrics recorder."""

from __future__ import annotations

import pytest

from app.core.metrics import (
    RECORDER,
    RequestMetricsRecorder,
    RequestObservation,
)


def _observation(
    *,
    method: str = "GET",
    path: str = "/x",
    status_code: int = 200,
    duration_ms: float = 12.5,
) -> RequestObservation:
    return RequestObservation(
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        observed_at_ns=0,
    )


def test_recorder_rejects_invalid_capacity() -> None:
    with pytest.raises(ValueError, match="capacity"):
        RequestMetricsRecorder(capacity=0)


def test_recorder_record_and_snapshot() -> None:
    recorder = RequestMetricsRecorder(capacity=4)
    recorder.record(_observation(path="/a", duration_ms=10.0))
    recorder.record(_observation(path="/a", duration_ms=20.0))
    recorder.record(_observation(path="/b", status_code=500, duration_ms=30.0))
    recent, summary = recorder.snapshot()
    assert len(recent) == 3
    assert summary.total == 3
    assert summary.sum_ms == pytest.approx(60.0)
    assert summary.min_ms == 10.0
    assert summary.max_ms == 30.0
    assert summary.status_counts == {200: 2, 500: 1}
    assert summary.path_counts == {"/a": 2, "/b": 1}


def test_recorder_to_payload_shape() -> None:
    recorder = RequestMetricsRecorder(capacity=8)
    recorder.record(_observation(duration_ms=4.0))
    payload = recorder.to_payload()
    assert payload["capacity"] == 8
    assert payload["size"] == 1
    assert payload["summary"]["total_requests"] == 1
    assert payload["summary"]["average_ms"] == 4.0
    assert payload["summary"]["by_status"] == {200: 1}
    assert payload["summary"]["by_path"] == {"/x": 1}
    assert payload["recent"][0]["method"] == "GET"
    assert payload["recent"][0]["request_id"] is None


def test_recorder_ring_buffer_evicts_oldest() -> None:
    recorder = RequestMetricsRecorder(capacity=2)
    recorder.record(_observation(path="/a"))
    recorder.record(_observation(path="/b"))
    recorder.record(_observation(path="/c"))
    recent, summary = recorder.snapshot()
    assert len(recent) == 2
    assert [item.path for item in recent] == ["/b", "/c"]
    assert summary.total == 3


def test_recorder_reset_clears_state() -> None:
    recorder = RequestMetricsRecorder(capacity=2)
    recorder.record(_observation())
    recorder.reset()
    assert recorder.size == 0
    assert recorder.to_payload()["summary"]["total_requests"] == 0


def test_recorder_observation_to_payload_round_trip() -> None:
    observation = RequestObservation(
        method="POST",
        path="/datasets",
        status_code=201,
        duration_ms=1.5,
        observed_at_ns=1_000_000_000,
        request_id="abc",
    )
    payload = observation.to_payload()
    assert payload == {
        "method": "POST",
        "path": "/datasets",
        "status_code": 201,
        "duration_ms": 1.5,
        "observed_at": 1.0,
        "request_id": "abc",
    }


def test_singleton_recorder_exists() -> None:
    assert isinstance(RECORDER, RequestMetricsRecorder)
    assert RECORDER.capacity >= 1
