"""AI interpretation API schemas (Task 7)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

HypothesisCategoryLiteral = Literal[
    "schema_drift", "data_quality", "pipeline", "upstream_source", "other"
]


class HypothesisResponse(ApiModel):
    category: HypothesisCategoryLiteral
    summary: str
    affected_columns: list[str] = Field(default_factory=list)
    supporting_finding_ids: list[UUID] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class AIInterpretationResponse(ApiModel):
    interpretation_id: UUID
    dataset_id: UUID
    profile_id: UUID
    provider_name: str
    model_name: str
    formula_version: str
    summary: str
    overall_confidence: float = Field(ge=0.0, le=1.0)
    input_finding_ids: list[UUID] = Field(default_factory=list)
    hypotheses: list[HypothesisResponse] = Field(default_factory=list)
    created_at: str


class AIInterpretationListResponse(ApiModel):
    items: list[AIInterpretationResponse]
    pagination: Pagination


__all__ = [
    "AIInterpretationListResponse",
    "AIInterpretationResponse",
    "HypothesisCategoryLiteral",
    "HypothesisResponse",
]
