"""Unit tests for machine-readable logs and correlation context."""

import json
import logging

from app.core.logging import (
    JsonFormatter,
    RequestContextFilter,
    bind_request_id,
    get_request_id,
    reset_request_id,
)


def test_json_formatter_emits_whitelisted_structured_fields() -> None:
    record = logging.LogRecord(
        name="quanta.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request_completed",
        args=(),
        exc_info=None,
    )
    record.method = "GET"
    record.path = "/health"
    record.status_code = 200
    RequestContextFilter().filter(record)

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "request_completed"
    assert payload["method"] == "GET"
    assert payload["path"] == "/health"
    assert payload["status_code"] == 200
    assert "pathname" not in payload


def test_request_id_context_is_restored() -> None:
    assert get_request_id() == "-"
    token = bind_request_id("request-123")
    assert get_request_id() == "request-123"
    reset_request_id(token)
    assert get_request_id() == "-"
