"""HTTP routes for the validation layer (Task 9)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.db.models.validation import Validation
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.validations import (
    ValidationImpactResponse,
    ValidationListResponse,
    ValidationResponse,
)
from app.validation.service import (
    ValidationService,
    validation_to_dict,
)

router = APIRouter(prefix="/datasets", tags=["validations"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _isoformat(value: datetime | object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _to_response(row: Validation) -> ValidationResponse:
    payload = validation_to_dict(row)
    impact_payload: dict[str, Any] = payload.get("impact", {})
    return ValidationResponse(
        validation_id=row.id,
        dataset_id=row.dataset_id,
        dataset_version_id=row.dataset_version_id,
        profile_id=row.profile_id,
        recommendation_id=row.recommendation_id,
        operation_kind=row.operation_kind,
        status=payload["status"],
        title=row.title,
        rationale=row.rationale,
        impact=ValidationImpactResponse(
            affected_rows=impact_payload.get("affected_rows"),
            affected_columns=list(impact_payload.get("affected_columns") or []),
            summary=impact_payload.get("summary", ""),
            unexpected_side_effects=list(
                impact_payload.get("unexpected_side_effects") or []
            ),
        ),
        components=payload["components"],
        formula_version=row.formula_version,
        created_at=_isoformat(row.created_at),
    )


def _pagination(page: int, page_size: int, total_items: int) -> Pagination:
    total_pages = (total_items + page_size - 1) // page_size if total_items else 0
    return Pagination(
        page=page, page_size=page_size, total_items=total_items, total_pages=total_pages
    )


@router.post(
    "/{dataset_id}/recommendations/{recommendation_id}/validate",
    response_model=ValidationResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
    summary="Run a deterministic validation preview for one recommendation",
    operation_id="create_dataset_recommendation_validation",
)
def create_dataset_recommendation_validation(
    dataset_id: UUID,
    recommendation_id: UUID,
    service: Annotated[
        ValidationService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_validation_service"]
            ).get_validation_service
        ),
    ],
) -> ValidationResponse:
    """Run the deterministic preview engine and persist the result."""

    _ = dataset_id  # route-level scoping; service resolves the version
    row = service.validate_recommendation(recommendation_id)
    return _to_response(row)


@router.get(
    "/{dataset_id}/recommendations/{recommendation_id}/validations",
    response_model=ValidationListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List validations for one recommendation",
    operation_id="list_dataset_recommendation_validations",
)
def list_dataset_recommendation_validations(
    dataset_id: UUID,
    recommendation_id: UUID,
    service: Annotated[
        ValidationService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_validation_service"]
            ).get_validation_service
        ),
    ],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> ValidationListResponse:
    """Return a paginated list of validation rows for the recommendation."""

    _ = dataset_id  # route-level scoping; service resolves the recommendation
    items, total = service.list_for_recommendation(
        recommendation_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return ValidationListResponse(
        items=[_to_response(row) for row in items],
        pagination=_pagination(page, page_size, total),
    )


@router.get(
    "/{dataset_id}/recommendations/{recommendation_id}/validations/{validation_id}",
    response_model=ValidationResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Return a specific validation",
    operation_id="get_dataset_recommendation_validation",
)
def get_dataset_recommendation_validation(
    dataset_id: UUID,
    recommendation_id: UUID,
    validation_id: UUID,
    service: Annotated[
        ValidationService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_validation_service"]
            ).get_validation_service
        ),
    ],
) -> ValidationResponse:
    """Return a single persisted validation row."""

    _ = dataset_id, recommendation_id  # route-level scoping only
    row = service.get_validation(validation_id)
    return _to_response(row)


__all__ = ["_to_response", "router"]


__all__.append("router")