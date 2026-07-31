"""API contract tests for liveness and readiness."""

from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db


class HealthySession:
    def __init__(self) -> None:
        self.executed_sql = ""

    def execute(self, statement: object) -> None:
        self.executed_sql = str(statement)


class FailingSession:
    def execute(self, statement: object) -> None:
        del statement
        raise SQLAlchemyError("connection refused")


def test_liveness_is_independent_of_database(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "frontend-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "frontend-123"
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "Quanta Test API"
    assert body["version"] == "0.9.0"
    assert body["environment"] == "test"
    assert body["timestamp"]


def test_readiness_executes_database_probe(
    application: FastAPI,
    client: TestClient,
) -> None:
    session = HealthySession()
    application.dependency_overrides[get_db] = lambda: cast(Session, session)

    response = client.get("/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"] == {"database": "up"}
    assert session.executed_sql == "SELECT 1"


def test_readiness_hides_database_failure_details(
    application: FastAPI,
    client: TestClient,
) -> None:
    application.dependency_overrides[get_db] = lambda: cast(Session, FailingSession())

    response = client.get("/health/ready", headers={"X-Request-ID": "probe-1"})

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "database_unavailable",
            "message": "The database is not ready to accept requests.",
            "details": {"check": "database"},
            "request_id": "probe-1",
        }
    }
    assert "connection refused" not in response.text


def test_openapi_documents_health_contracts(client: TestClient) -> None:
    document = client.get("/openapi.json").json()

    assert document["paths"]["/health"]["get"]["operationId"] == "get_health"
    assert document["paths"]["/health/ready"]["get"]["responses"]["503"]
