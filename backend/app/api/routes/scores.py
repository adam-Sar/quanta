"""HTTP routes for deterministic quality scoring (Task 5)."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.dependencies import get_scoring_service
from app.db.models.quality_score import QualityScore
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.scores import (
    PerFindingScore,
    QualityScoreListResponse,
    QualityScoreResponse,
    ScoreComponentBucket,
    ScoreComponents,
)
from app.scoring.service import ScoringService

router = APIRouter(prefix="/datasets", tags=["scores"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _bucket(payload: dict[str, Any]) -> ScoreComponentBucket:
    return ScoreComponentBucket(
        count=int(payload.get("count", 0)),
        penalty_total=float(payload.get("penalty_total", 0.0)),
        penalty_normalized=float(payload.get("penalty_normalized", 0.0)),
    )


def _components(payload: dict[str, Any] | None) -> ScoreComponents:
    raw = payload or {}
    return ScoreComponents(
        by_kind={key: _bucket(value) for key, value in (raw.get("by_kind") or {}).items()},
        by_severity={key: _bucket(value) for key, value in (raw.get("by_severity") or {}).items()},
        by_column={key: _bucket(value) for key, value in (raw.get("by_column") or {}).items()},
        overall_penalty_total=float(raw.get("overall_penalty_total", 0.0)),
        overall_penalty_normalized=float(raw.get("overall_penalty_normalized", 0.0)),
        column_count=int(raw.get("column_count", 0)),
        per_finding=[PerFindingScore(**item) for item in (raw.get("per_finding") or [])],
    )


def _to_score_response(row: QualityScore) -> QualityScoreResponse:
    return QualityScoreResponse(
        score_id=row.id,
        dataset_id=row.dataset_id,
        dataset_version_id=row.dataset_version_id,
        profile_id=row.profile_id,
        finding_count=row.finding_count,
        score=float(row.score),
        grade=row.grade.value if hasattr(row.grade, "value") else row.grade,  # type: ignore[arg-type]
        formula_version=row.formula_version,
        components=_components(dict(row.components) if row.components else {}),
        created_at=row.created_at.isoformat(),
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
    "/{dataset_id}/scores",
    response_model=QualityScoreResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Score the latest detection batch of a dataset",
    operation_id="create_dataset_score",
)
def create_dataset_score(
    dataset_id: UUID,
    service: Annotated[ScoringService, Depends(get_scoring_service)],
) -> QualityScoreResponse:
    """Run the deterministic scoring formula against the latest detection batch."""

    row = service.score_latest(dataset_id)
    return _to_score_response(row)


@router.get(
    "/{dataset_id}/score",
    response_model=QualityScoreResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Return the latest quality score for a dataset",
    operation_id="get_latest_dataset_score",
)
def get_latest_dataset_score(
    dataset_id: UUID,
    service: Annotated[ScoringService, Depends(get_scoring_service)],
) -> QualityScoreResponse:
    """Return the most recently created score for the dataset's latest profile."""

    row = service.get_latest(dataset_id)
    return _to_score_response(row)


@router.get(
    "/{dataset_id}/versions/{version_id}/score",
    response_model=QualityScoreResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Return the latest quality score for a specific dataset version",
    operation_id="get_dataset_version_score",
)
def get_dataset_version_score(
    dataset_id: UUID,
    version_id: UUID,
    service: Annotated[ScoringService, Depends(get_scoring_service)],
) -> QualityScoreResponse:
    """Return the most recently created score for a specific version."""

    row = service.get_for_version(dataset_id, version_id)
    return _to_score_response(row)


@router.get(
    "/{dataset_id}/scores",
    response_model=QualityScoreListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List quality score runs for a dataset",
    operation_id="list_dataset_scores",
)
def list_dataset_scores(
    dataset_id: UUID,
    service: Annotated[ScoringService, Depends(get_scoring_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> QualityScoreListResponse:
    """Return a paginated list of score rows for a dataset."""

    items, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return QualityScoreListResponse(
        items=[_to_score_response(row) for row in items],
        pagination=_pagination(page, page_size, total_items),
    )


__all__ = [
    "_components",
    "_to_score_response",
    "router",
]
