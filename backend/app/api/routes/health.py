"""Liveness and infrastructure-readiness endpoints."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.exceptions import DatabaseUnavailableError
from app.db.session import check_database, get_db
from app.schemas.common import ErrorResponse
from app.schemas.health import HealthResponse, ReadinessChecks, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Process liveness",
    operation_id="get_health",
)
def get_health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Report process health without depending on external infrastructure."""

    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        timestamp=datetime.now(UTC),
    )


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    responses={503: {"model": ErrorResponse, "description": "Database is unavailable"}},
    summary="Service readiness",
    operation_id="get_readiness",
)
def get_readiness(session: Annotated[Session, Depends(get_db)]) -> ReadinessResponse:
    """Report whether required infrastructure can serve application requests."""

    try:
        check_database(session)
    except SQLAlchemyError as exc:
        raise DatabaseUnavailableError from exc

    return ReadinessResponse(
        status="ready",
        checks=ReadinessChecks(database="up"),
        timestamp=datetime.now(UTC),
    )
