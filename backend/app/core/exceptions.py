"""Application exceptions and consistent public API error handling."""

import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_request_id
from app.schemas.common import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)


class ApplicationError(Exception):
    """Expected operational failure safe to expose to an API consumer."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class DatabaseUnavailableError(ApplicationError):
    """Raised when a readiness database probe cannot complete."""

    def __init__(self) -> None:
        super().__init__(
            code="database_unavailable",
            message="The database is not ready to accept requests.",
            status_code=HTTPStatus.SERVICE_UNAVAILABLE,
            details={"check": "database"},
        )


def _request_id_for(request: Request) -> str:
    """Read correlation state even when outer server middleware handles an exception."""

    return str(getattr(request.state, "request_id", get_request_id()))


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | list[dict[str, Any]] | None = None,
) -> JSONResponse:
    request_id = _request_id_for(request)
    body = ErrorResponse(
        error=ErrorDetail(
            code=code,
            message=message,
            details=details,
            request_id=request_id,
        )
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json"),
        headers={"X-Request-ID": request_id},
    )


async def application_error_handler(request: Request, exc: ApplicationError) -> JSONResponse:
    logger.warning(
        "application_error",
        extra={"error_code": exc.code, "status_code": exc.status_code},
    )
    return _error_response(
        request,
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {
            "location": ".".join(str(part) for part in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors()
    ]
    return _error_response(
        request,
        status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        code="validation_error",
        message="The request did not pass validation.",
        details=details,
    )


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code_by_status: dict[int, str] = {
        HTTPStatus.NOT_FOUND: "not_found",
        HTTPStatus.METHOD_NOT_ALLOWED: "method_not_allowed",
    }
    return _error_response(
        request,
        status_code=exc.status_code,
        code=code_by_status.get(exc.status_code, "http_error"),
        message=str(exc.detail),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = _request_id_for(request)
    logger.exception(
        "unhandled_application_error",
        exc_info=exc,
        extra={"request_id": request_id},
    )
    return _error_response(
        request,
        status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
        code="internal_error",
        message="An unexpected error occurred.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register one stable error envelope for framework and application errors."""

    app.add_exception_handler(ApplicationError, application_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)
