"""Central structured logging configuration and request correlation context."""

import json
import logging
import logging.config
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings

_request_id: ContextVar[str] = ContextVar("request_id", default="-")


class RequestContextFilter(logging.Filter):
    """Attach the current request identifier to every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = _request_id.get()
        return True


class JsonFormatter(logging.Formatter):
    """Emit stable JSON logs without serializing arbitrary record internals."""

    structured_fields = (
        "method",
        "path",
        "status_code",
        "duration_ms",
        "error_code",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for field in self.structured_fields:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(settings: Settings) -> None:
    """Configure application and server logs through the standard logging module."""

    formatter: dict[str, Any]
    if settings.log_format == "json":
        formatter = {"()": JsonFormatter}
    else:
        formatter = {
            "format": "%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s"
        }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {"request_context": {"()": RequestContextFilter}},
            "formatters": {"default": formatter},
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "filters": ["request_context"],
                    "stream": "ext://sys.stdout",
                }
            },
            "root": {"level": settings.log_level, "handlers": ["console"]},
            "loggers": {
                "uvicorn": {"handlers": ["console"], "propagate": False},
                "uvicorn.access": {"handlers": ["console"], "propagate": False},
                "sqlalchemy.engine": {
                    "level": "WARNING",
                    "handlers": ["console"],
                    "propagate": False,
                },
            },
        }
    )


def bind_request_id(request_id: str) -> Token[str]:
    """Bind a request identifier and return a token used to restore context."""

    return _request_id.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    """Restore the prior request context."""

    _request_id.reset(token)


def get_request_id() -> str:
    """Expose the current correlation identifier to API error handlers."""

    return _request_id.get()
