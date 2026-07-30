"""Schemas shared across API domains."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    """Base model for API contracts; unknown response fields are programming errors."""

    model_config = ConfigDict(extra="forbid")


class ErrorDetail(ApiModel):
    code: str
    message: str
    details: dict[str, Any] | list[dict[str, Any]] | None = None
    request_id: str


class ErrorResponse(ApiModel):
    error: ErrorDetail


class PaginationMeta(ApiModel):
    """Reserved common pagination shape for collection APIs added in later tasks."""

    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total_items: int = Field(ge=0)
    total_pages: int = Field(ge=0)
