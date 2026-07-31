"""HTTP middleware shared by all API routes (Task 11).

Adds the Task 11 hardening pieces on top of the Task 1 request
correlation middleware:

* ``X-Content-Type-Options: nosniff`` and ``X-Frame-Options: DENY``
  security headers on every response.
* Request timing recorded into the in-process ``RECORDER`` so the
  ``GET /metrics`` route can summarize it.
* A request-budget check that warns when a single request exceeds
  ``settings.request_budget_ms`` (the in-process worker can also use
  the same budget as a soft deadline).
* Rate-limit enforcement on every route (per ``(client_key, scope)``
  tuple) so a malicious or buggy client cannot monopolize the
  worker. The middleware builds the 429 response directly so the
  envelope, the ``Retry-After`` header, and the ``request_id`` are
  produced consistently without depending on a downstream exception
  handler.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Awaitable, Callable
from http import HTTPStatus
from uuid import uuid4

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.core.logging import bind_request_id, get_request_id, reset_request_id
from app.core.metrics import RECORDER, RequestObservation, now_monotonic_ns
from app.core.ratelimit import SlidingWindowRateLimiter
from app.schemas.common import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

# Process-wide rate limiter. Eagerly built at import time with the
# cached ``Settings`` so tests can call ``reset_limiter`` without
# having to make a request first. Rebuilt when the operator-facing
# capacity / window changes so a settings reload takes effect.
_LIMITER: SlidingWindowRateLimiter = SlidingWindowRateLimiter(
    capacity=get_settings().rate_limit_capacity,
    window_seconds=get_settings().rate_limit_window_seconds,
)
_LIMITER_CAPACITY: int = _LIMITER.capacity
_LIMITER_WINDOW_SECONDS: float = _LIMITER.window_seconds


def _request_id_from(request: Request) -> str:
    candidate = request.headers.get("X-Request-ID", "")
    if _SAFE_REQUEST_ID.fullmatch(candidate):
        return candidate
    return str(uuid4())


def _client_key(request: Request) -> str:
    """Return the rate-limit bucket key for the current request.

    Uses the first IP in ``X-Forwarded-For`` if present (operator must
    terminate the proxy and set the header), otherwise the direct
    client address. Returns ``"anonymous"`` when the address is
    missing so the limiter never raises.
    """

    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or "anonymous"
    if request.client is not None and request.client.host:
        return request.client.host
    return "anonymous"


def _scope(request: Request) -> str:
    """Per-route rate-limit scope keyed by the URL path template.

    Falls back to the raw path when the route is unmatched so a
    404 still counts against the limiter and the operator can see
    bad paths in ``GET /metrics``.
    """

    route = request.scope.get("route")
    path_template = getattr(route, "path", None) if route is not None else None
    if isinstance(path_template, str) and path_template:
        return f"{request.method} {path_template}"
    return f"{request.method} {request.url.path}"


def _get_settings(request: Request) -> Settings:
    """Pull the application ``Settings`` from FastAPI state.

    Falls back to ``get_settings()`` if the state has not been
    populated (for example in unit tests that build the middleware
    without the full app lifecycle).
    """

    state = getattr(request.app, "state", None)
    settings = getattr(state, "settings", None) if state is not None else None
    if settings is None:
        settings = get_settings()
    return settings


def _get_limiter(settings: Settings) -> SlidingWindowRateLimiter:
    """Return the process-wide limiter, rebuilding if the operator
    capacity / window changed.
    """

    global _LIMITER, _LIMITER_CAPACITY, _LIMITER_WINDOW_SECONDS
    if (
        _LIMITER_CAPACITY != settings.rate_limit_capacity
        or _LIMITER_WINDOW_SECONDS != settings.rate_limit_window_seconds
    ):
        _LIMITER = SlidingWindowRateLimiter(
            capacity=settings.rate_limit_capacity,
            window_seconds=settings.rate_limit_window_seconds,
        )
        _LIMITER_CAPACITY = settings.rate_limit_capacity
        _LIMITER_WINDOW_SECONDS = settings.rate_limit_window_seconds
    return _LIMITER


def reset_limiter() -> None:
    """Clear all rate-limit buckets. Test-only convenience."""

    _LIMITER.reset()


def _build_rate_limit_response(
    request: Request,
    *,
    request_id: str,
    retry_after_seconds: int,
    scope: str,
) -> JSONResponse:
    """Return the standard 429 envelope for the rate-limit middleware."""

    body = ErrorResponse(
        error=ErrorDetail(
            code="rate_limit_exceeded",
            message="Too many requests. Retry after the indicated delay.",
            details={
                "retry_after_seconds": retry_after_seconds,
                "scope": scope,
            },
            request_id=request_id,
        )
    )
    return JSONResponse(
        status_code=HTTPStatus.TOO_MANY_REQUESTS,
        content=body.model_dump(mode="json"),
        headers={
            "X-Request-ID": request_id,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Retry-After": str(max(1, retry_after_seconds)),
        },
    )


async def request_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Correlate, time, rate-limit, and summarize every request."""

    request_id = _request_id_from(request)
    request.state.request_id = request_id
    token = bind_request_id(request_id)
    started = time.perf_counter()
    status_code = 500
    response: Response | None = None
    try:
        settings = _get_settings(request)
        decision = _get_limiter(settings).check(
            client_key=_client_key(request),
            scope=_scope(request),
        )
        if not decision.allowed:
            logger.warning(
                "rate_limit_exceeded",
                extra={
                    "client_key": _client_key(request),
                    "scope": decision.scope,
                    "retry_after_seconds": decision.retry_after_seconds,
                },
            )
            response = _build_rate_limit_response(
                request,
                request_id=request_id,
                retry_after_seconds=decision.retry_after_seconds,
                scope=decision.scope,
            )
            status_code = response.status_code
            return response
        response = await call_next(request)
        status_code = response.status_code
        response.headers.setdefault("X-Request-ID", request_id)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response
    finally:
        duration_ms = (time.perf_counter() - started) * 1000.0
        if response is not None and duration_ms > settings.request_budget_ms:
            logger.warning(
                "request_budget_exceeded",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "budget_ms": settings.request_budget_ms,
                    "observed_ms": round(duration_ms, 3),
                },
            )
        RECORDER.record(
            RequestObservation(
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=duration_ms,
                observed_at_ns=now_monotonic_ns(),
                request_id=request_id,
            )
        )
        if status_code == 500 and not _response_already_emitted(request):
            logger.exception(
                "request_failed_before_response",
                extra={"request_id": request_id},
            )
        logger.info(
            "request_completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        reset_request_id(token)


def _response_already_emitted(request: Request) -> bool:
    """Return ``True`` once the ASGI server has started sending a response."""

    return bool(getattr(request, "_response_started", False))


__all__ = [
    "request_context_middleware",
    "reset_limiter",
]
