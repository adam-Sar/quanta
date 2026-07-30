"""HTTP routes for deterministic dataset detection (Task 4)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_detection_service
from app.db.models.finding import Finding
from app.db.session import get_db
from app.detection.service import DetectionService
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.findings import (
    DetectionRunResponse,
    FindingListResponse,
    FindingResponse,
)
from app.services.exceptions import DatasetNotFoundError

router = APIRouter(prefix="/datasets", tags=["findings"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _to_finding_response(row: Finding) -> FindingResponse:
    return FindingResponse(
        finding_id=row.id,
        dataset_id=row.dataset_id,
        dataset_version_id=row.dataset_version_id,
        profile_id=row.profile_id,
        kind=row.kind.value,
        severity=row.severity.value,
        column_name=row.column_name,
        metric=row.metric,
        value=float(row.value),
        threshold=float(row.threshold),
        description=row.description,
        details=dict(row.details) if row.details else {},
    )


def _pagination(page: int, page_size: int, total_items: int) -> Pagination:
    total_pages = (total_items + page_size - 1) // page_size if total_items else 0
    return Pagination(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


def _dataset_exists(session: Session, dataset_id: UUID) -> bool:
    from app.db.models.dataset import DatasetVersion

    statement = select(func.count(DatasetVersion.id)).where(DatasetVersion.dataset_id == dataset_id)
    return bool(session.scalar(statement))


def _latest_profile_id(session: Session, dataset_id: UUID) -> UUID | None:
    from app.db.models.profile import DatasetProfile

    statement = (
        select(DatasetProfile.id)
        .where(DatasetProfile.dataset_id == dataset_id)
        .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
        .limit(1)
    )
    return session.scalar(statement)


@router.post(
    "/{dataset_id}/detections",
    response_model=DetectionRunResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Run detection on the latest profile of a dataset",
    operation_id="create_dataset_detection",
)
def create_dataset_detection(
    dataset_id: UUID,
    service: Annotated[DetectionService, Depends(get_detection_service)],
    session: Annotated[Session, Depends(get_db)],
) -> DetectionRunResponse:
    """Run all Task 4 detectors and persist the new finding rows."""

    if not _dataset_exists(session, dataset_id):
        raise DatasetNotFoundError(dataset_id)
    findings = service.detect_latest(dataset_id)
    profile_id = findings[0].profile_id if findings else _latest_profile_id(session, dataset_id)
    return DetectionRunResponse(
        dataset_id=dataset_id,
        profile_id=profile_id,
        finding_count=len(findings),
        findings=[_to_finding_response(row) for row in findings],
    )


@router.get(
    "/{dataset_id}/detections",
    response_model=FindingListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List finding runs for a dataset",
    operation_id="list_dataset_detections",
)
def list_dataset_detections(
    dataset_id: UUID,
    service: Annotated[DetectionService, Depends(get_detection_service)],
    session: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> FindingListResponse:
    """Return a paginated list of finding rows for a dataset."""

    if not _dataset_exists(session, dataset_id):
        raise DatasetNotFoundError(dataset_id)
    items, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return FindingListResponse(
        items=[_to_finding_response(row) for row in items],
        pagination=_pagination(page, page_size, total_items),
    )
