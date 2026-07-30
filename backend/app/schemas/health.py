"""Health endpoint response contracts."""

from datetime import datetime
from typing import Literal

from app.schemas.common import ApiModel


class HealthResponse(ApiModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
    timestamp: datetime


class ReadinessChecks(ApiModel):
    database: Literal["up"]


class ReadinessResponse(ApiModel):
    status: Literal["ready"]
    checks: ReadinessChecks
    timestamp: datetime
