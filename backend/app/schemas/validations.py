"""Validation API schemas (Task 9)."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

ValidationStatusLiteral = Literal["valid", "warning", "invalid"]


class ValidationImpactResponse(ApiModel):
    affected_rows: int | None = None
    affected_columns: list[str] = Field(default_factory=list)
    summary: str = ""
    unexpected_side_effects: list[str] = Field(default_factory=list)


class ValidationResponse(ApiModel):
    validation_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    recommendation_id: UUID
    operation_kind: str
    status: ValidationStatusLiteral
    title: str
    rationale: str
    impact: ValidationImpactResponse
    components: dict[str, Any] = Field(default_factory=dict)
    formula_version: str
    created_at: str


class ValidationListResponse(ApiModel):
    items: list[ValidationResponse]
    pagination: Pagination


__all__ = [
    "ValidationImpactResponse",
    "ValidationListResponse",
    "ValidationResponse",
    "ValidationStatusLiteral",
]