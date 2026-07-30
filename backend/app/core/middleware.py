"""HTTP middleware shared by all API routes."""

import logging
import re
import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import Request, Response

from app.core.logging import bind_request_id, reset_request_id

logger = logging.getLogger(__name__)
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def _request_id_from(request: Request) -> str:
    candidate = request.headers.get("X-Request-ID", "")
    if _SAFE_REQUEST_ID.fullmatch(candidate):
        return candidate
    return str(uuid4())


async def request_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Correlate and summarize requests without logging bodies or dataset contents."""

    request_id = _request_id_from(request)
    request.state.request_id = request_id
    token = bind_request_id(request_id)
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
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
