"""HTTP routes for deterministic history comparisons (Task 6)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.dependencies import get_history_service
from app.db.models.history_comparison import HistoryComparison
from app.history.service import HistoryService
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.history import (
    CategoricalDriftResponse,
    ColumnDiffResponse,
    DistributionDriftResponse,
    HistoryComparisonListResponse,
    HistoryComparisonRequest,
    HistoryComparisonResponse,
    LineageEdgeResponse,
    LineageResponse,
    NumericDriftResponse,
    SchemaDiffResponse,
    ScoreDriftResponse,
)

router = APIRouter(prefix="/datasets", tags=["history"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _isoformat(value: datetime | object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _schema_response(payload: dict[str, Any] | None) -> SchemaDiffResponse:
    raw = payload or {}
    type_changes = [
        ColumnDiffResponse(
            name=str(item.get("name", "")),
            change=item.get("change", "added"),  # type: ignore[arg-type]
            base_physical_type=item.get("base_physical_type"),
            target_physical_type=item.get("target_physical_type"),
            base_logical_type=item.get("base_logical_type"),
            target_logical_type=item.get("target_logical_type"),
        )
        for item in (raw.get("type_changes") or [])
    ]
    return SchemaDiffResponse(
        added=list(raw.get("added") or []),
        removed=list(raw.get("removed") or []),
        type_changes=type_changes,
    )


def _distribution_response(payload: dict[str, Any] | None) -> DistributionDriftResponse:
    raw = payload or {}
    numeric = [
        NumericDriftResponse(
            column=str(item.get("column", "")),
            metric=item.get("metric", "mean"),  # type: ignore[arg-type]
            base_value=item.get("base_value"),
            target_value=item.get("target_value"),
            absolute_change=item.get("absolute_change"),
            relative_change=item.get("relative_change"),
        )
        for item in (raw.get("numeric") or [])
    ]
    categorical = [
        CategoricalDriftResponse(
            column=str(item.get("column", "")),
            metric=item.get("metric", "psi"),  # type: ignore[arg-type]
            psi=float(item.get("psi", 0.0)),
            base_top_values=list(item.get("base_top_values") or []),
            target_top_values=list(item.get("target_top_values") or []),
        )
        for item in (raw.get("categorical") or [])
    ]
    return DistributionDriftResponse(numeric=numeric, categorical=categorical)


def _score_response(payload: dict[str, Any] | None) -> ScoreDriftResponse:
    raw = payload or {}
    return ScoreDriftResponse(
        base_score=raw.get("base_score"),
        target_score=raw.get("target_score"),
        delta=raw.get("delta"),
        absolute_delta=raw.get("absolute_delta"),
        base_grade=raw.get("base_grade"),
        target_grade=raw.get("target_grade"),
        grade_changed=bool(raw.get("grade_changed", False)),
    )


def _to_comparison_response(row: HistoryComparison) -> HistoryComparisonResponse:
    return HistoryComparisonResponse(
        comparison_id=row.id,
        dataset_id=row.dataset_id,
        base_version_id=row.base_version_id,
        target_version_id=row.target_version_id,
        formula_version=row.formula_version,
        schema_diff=_schema_response(dict(row.schema_diff) if row.schema_diff else {}),
        distribution_drift=_distribution_response(
            dict(row.distribution_drift) if row.distribution_drift else {}
        ),
        score_drift=_score_response(dict(row.score_drift) if row.score_drift else {}),
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
    "/{dataset_id}/comparisons",
    response_model=HistoryComparisonResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Compare two dataset versions and persist the result",
    operation_id="create_dataset_comparison",
)
def create_dataset_comparison(
    dataset_id: UUID,
    payload: HistoryComparisonRequest,
    service: Annotated[HistoryService, Depends(get_history_service)],
) -> HistoryComparisonResponse:
    """Run the deterministic history comparison and persist the row."""

    row = service.compare_versions(
        dataset_id=dataset_id,
        base_version_id=payload.base_version_id,
        target_version_id=payload.target_version_id,
    )
    return _to_comparison_response(row)


@router.get(
    "/{dataset_id}/comparisons/{comparison_id}",
    response_model=HistoryComparisonResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Return a specific history comparison",
    operation_id="get_dataset_comparison",
)
def get_dataset_comparison(
    dataset_id: UUID,
    comparison_id: UUID,
    service: Annotated[HistoryService, Depends(get_history_service)],
) -> HistoryComparisonResponse:
    """Return a single persisted comparison row."""

    row = service.get_comparison(comparison_id)
    return _to_comparison_response(row)


@router.get(
    "/{dataset_id}/comparisons",
    response_model=HistoryComparisonListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List history comparison runs for a dataset",
    operation_id="list_dataset_comparisons",
)
def list_dataset_comparisons(
    dataset_id: UUID,
    service: Annotated[HistoryService, Depends(get_history_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> HistoryComparisonListResponse:
    """Return a paginated list of comparison rows for a dataset."""

    items, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return HistoryComparisonListResponse(
        items=[_to_comparison_response(row) for row in items],
        pagination=_pagination(page, page_size, total_items),
    )


@router.get(
    "/{dataset_id}/lineage",
    response_model=LineageResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Return the deterministic lineage edges for a dataset",
    operation_id="get_dataset_lineage",
)
def get_dataset_lineage(
    dataset_id: UUID,
    service: Annotated[HistoryService, Depends(get_history_service)],
) -> LineageResponse:
    """Walk the version chain and return the ordered lineage edges."""

    edges = service.lineage(dataset_id)
    return LineageResponse(
        dataset_id=dataset_id,
        edges=[
            LineageEdgeResponse(
                dataset_id=edge.dataset_id,
                from_version_id=edge.from_version_id,
                from_version_number=edge.from_version_number,
                from_created_at=_isoformat(edge.from_created_at),
                to_version_id=edge.to_version_id,
                to_version_number=edge.to_version_number,
                to_created_at=_isoformat(edge.to_created_at),
            )
            for edge in edges
        ],
    )


__all__ = ["router"]
