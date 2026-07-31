"""Job API schemas (Task 10)."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

JobKindLiteral = Literal[
    "profile",
    "detect",
    "score",
    "history",
    "recommendations",
    "validations",
]

JobStatusLiteral = Literal["pending", "running", "succeeded", "failed"]


class JobCreateRequest(ApiModel):
    """Optional structured inputs for ``POST /datasets/{dataset_id}/jobs``."""

    kind: JobKindLiteral
    profile_id: UUID | None = None
    title: str | None = Field(default=None, max_length=255)
    parameters: dict[str, Any] = Field(default_factory=dict)


class JobResponse(ApiModel):
    job_id: UUID
    dataset_id: UUID
    profile_id: UUID | None
    kind: JobKindLiteral
    status: JobStatusLiteral
    title: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)
    error: dict[str, Any] = Field(default_factory=dict)
    formula_version: str
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None


class JobListResponse(ApiModel):
    items: list[JobResponse]
    pagination: Pagination


__all__ = [
    "JobCreateRequest",
    "JobKindLiteral",
    "JobListResponse",
    "JobResponse",
    "JobStatusLiteral",
]
