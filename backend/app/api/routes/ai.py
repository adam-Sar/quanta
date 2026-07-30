"""HTTP routes for the AI reasoning layer (Task 7)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.ai.service import (
    ReasoningService,
)
from app.db.models.ai_interpretation import AIInterpretation
from app.schemas.ai import (
    AIInterpretationListResponse,
    AIInterpretationResponse,
    HypothesisResponse,
)
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination

router = APIRouter(prefix="/datasets", tags=["ai"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _isoformat(value: datetime | object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _to_response(row: AIInterpretation) -> AIInterpretationResponse:
    return AIInterpretationResponse(
        interpretation_id=row.id,
        dataset_id=row.dataset_id,
        profile_id=row.profile_id,
        provider_name=row.provider_name,
        model_name=row.model_name,
        formula_version=row.formula_version,
        summary=row.summary,
        overall_confidence=float(row.overall_confidence),
        input_finding_ids=[UUID(value) for value in (row.input_finding_ids or [])],
        hypotheses=[
            HypothesisResponse(
                category=item.get("category", "other"),  # type: ignore[arg-type]
                summary=item.get("summary", ""),
                affected_columns=list(item.get("affected_columns") or []),
                supporting_finding_ids=[
                    UUID(value) for value in (item.get("supporting_finding_ids") or [])
                ],
                confidence=float(item.get("confidence", 0.0)),
            )
            for item in (row.hypotheses or [])
        ],
        created_at=_isoformat(row.created_at),
    )


def _pagination(page: int, page_size: int, total_items: int) -> Pagination:
    total_pages = (total_items + page_size - 1) // page_size if total_items else 0
    return Pagination(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


@router.post(
    "/{dataset_id}/interpretations",
    response_model=AIInterpretationResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    summary="Run an AI interpretation on the latest detection batch",
    operation_id="create_dataset_interpretation",
)
def create_dataset_interpretation(
    dataset_id: UUID,
    service: Annotated[
        ReasoningService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_reasoning_service"]
            ).get_reasoning_service
        ),
    ],
) -> AIInterpretationResponse:
    """Run the AI reasoning layer against the latest detection batch."""

    row = service.interpret(dataset_id)
    return _to_response(row)


@router.get(
    "/{dataset_id}/interpretations/{interpretation_id}",
    response_model=AIInterpretationResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Return a specific AI interpretation",
    operation_id="get_dataset_interpretation",
)
def get_dataset_interpretation(
    dataset_id: UUID,
    interpretation_id: UUID,
    service: Annotated[
        ReasoningService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_reasoning_service"]
            ).get_reasoning_service
        ),
    ],
) -> AIInterpretationResponse:
    """Return a single persisted interpretation row."""

    row = service.get_interpretation(interpretation_id)
    return _to_response(row)


@router.get(
    "/{dataset_id}/interpretations",
    response_model=AIInterpretationListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List AI interpretation runs for a dataset",
    operation_id="list_dataset_interpretations",
)
def list_dataset_interpretations(
    dataset_id: UUID,
    service: Annotated[
        ReasoningService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_reasoning_service"]
            ).get_reasoning_service
        ),
    ],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> AIInterpretationListResponse:
    """Return a paginated list of interpretation rows for a dataset."""

    items, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return AIInterpretationListResponse(
        items=[_to_response(row) for row in items],
        pagination=_pagination(page, page_size, total_items),
    )


__all__ = ["_to_response", "router"]
