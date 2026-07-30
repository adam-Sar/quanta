"""HTTP routes for the recommendations layer (Task 8)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.db.models.recommendation import Recommendation
from app.recommendations.service import RecommendationService
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.recommendations import (
    RecommendationListResponse,
    RecommendationOperationResponse,
    RecommendationResponse,
)

router = APIRouter(prefix="/datasets", tags=["recommendations"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _isoformat(value: datetime | object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _operation_payload(row: Recommendation) -> RecommendationOperationResponse | None:
    if row.operation_kind is None:
        return None
    return RecommendationOperationResponse(
        kind=row.operation_kind,  # type: ignore[arg-type]
        params=dict(row.operation_params or {}),
        preview_only=bool(row.preview_only),
    )


def _to_response(row: Recommendation) -> RecommendationResponse:
    return RecommendationResponse(
        recommendation_id=row.id,
        dataset_id=row.dataset_id,
        profile_id=row.profile_id,
        kind=row.kind,  # type: ignore[arg-type]
        severity=row.severity,  # type: ignore[arg-type]
        title=row.title,
        rationale=row.rationale,
        affected_columns=list(row.affected_columns or []),
        supporting_finding_ids=[
            UUID(value) for value in (row.supporting_finding_ids or [])
        ],
        confidence=float(row.confidence),
        priority=int(row.priority),
        operation=_operation_payload(row),
        formula_version=row.formula_version,
        components=dict(row.components or {}),
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
    "/{dataset_id}/recommendations",
    response_model=list[RecommendationResponse],
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
    summary="Run the recommendation rule engine on the latest detection batch",
    operation_id="create_dataset_recommendations",
)
def create_dataset_recommendations(
    dataset_id: UUID,
    service: Annotated[
        RecommendationService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_recommendation_service"]
            ).get_recommendation_service
        ),
    ],
) -> list[RecommendationResponse]:
    """Run the deterministic rule engine and persist fresh recommendation rows."""

    rows = service.recommend(dataset_id)
    return [_to_response(row) for row in rows]


@router.get(
    "/{dataset_id}/recommendations/{recommendation_id}",
    response_model=RecommendationResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Return a specific recommendation",
    operation_id="get_dataset_recommendation",
)
def get_dataset_recommendation(
    dataset_id: UUID,
    recommendation_id: UUID,
    service: Annotated[
        RecommendationService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_recommendation_service"]
            ).get_recommendation_service
        ),
    ],
) -> RecommendationResponse:
    """Return a single persisted recommendation row."""

    row = service.get_recommendation(recommendation_id)
    return _to_response(row)


@router.get(
    "/{dataset_id}/recommendations",
    response_model=RecommendationListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List recommendation rows for a dataset",
    operation_id="list_dataset_recommendations",
)
def list_dataset_recommendations(
    dataset_id: UUID,
    service: Annotated[
        RecommendationService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_recommendation_service"]
            ).get_recommendation_service
        ),
    ],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> RecommendationListResponse:
    """Return a paginated list of recommendation rows for a dataset."""

    items, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return RecommendationListResponse(
        items=[_to_response(row) for row in items],
        pagination=_pagination(page, page_size, total_items),
    )


__all__ = ["_to_response", "router"]
