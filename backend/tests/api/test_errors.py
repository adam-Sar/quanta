"""Tests for the stable API error envelope and request correlation."""

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_not_found_uses_standard_error_envelope(client: TestClient) -> None:
    response = client.get("/does-not-exist", headers={"X-Request-ID": "request-404"})

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Not Found",
            "details": None,
            "request_id": "request-404",
        }
    }


def test_unsafe_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "bad id\nvalue"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "bad id\nvalue"
    assert len(response.headers["X-Request-ID"]) == 36


def test_validation_error_omits_submitted_input(application: FastAPI) -> None:
    @application.get("/test/validated")
    def validated(value: int) -> dict[str, int]:
        return {"value": value}

    with TestClient(application) as client:
        response = client.get("/test/validated?value=secret-invalid-value")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["details"][0]["location"] == "query.value"
    assert "secret-invalid-value" not in response.text


def test_unhandled_error_is_sanitized(application: FastAPI) -> None:
    @application.get("/test/failure")
    def fail() -> None:
        raise RuntimeError("sensitive internal detail")

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/test/failure", headers={"X-Request-ID": "failure-1"})

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "internal_error",
        "message": "An unexpected error occurred.",
        "details": None,
        "request_id": "failure-1",
    }
    assert "sensitive internal detail" not in response.text
