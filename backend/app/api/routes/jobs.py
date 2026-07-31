"""HTTP routes for the durable analysis jobs layer (Task 10)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from app.db.models.job import Job
from app.jobs.service import JobService
from app.jobs.types import JobKind, JobRequest
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.jobs import (
    JobCreateRequest,
    JobKindLiteral,
    JobListResponse,
    JobResponse,
)

router = APIRouter(prefix="/datasets", tags=["jobs"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _to_response(row: Job) -> JobResponse:
    return JobResponse(
        job_id=row.id,
        dataset_id=row.dataset_id,
        profile_id=row.profile_id,
        kind=row.kind,  # type: ignore[arg-type]
        status=row.status,  # type: ignore[arg-type]
        title=row.title,
        parameters=dict(row.parameters or {}),
        result=dict(row.result or {}),
        error=dict(row.error or {}),
        formula_version=row.formula_version,
        created_at=_isoformat(row.created_at) or "",
        started_at=_isoformat(row.started_at),
        completed_at=_isoformat(row.completed_at),
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
    "/{dataset_id}/jobs",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
    summary="Create and run a durable analysis job for the dataset",
    operation_id="create_dataset_job",
)
def create_dataset_job(
    dataset_id: UUID,
    payload: Annotated[JobCreateRequest, Body(...)],
    service: Annotated[
        JobService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_job_service"]
            ).get_job_service
        ),
    ],
) -> JobResponse:
    """Create a fresh ``Job`` row, run the wrapped operation inline, persist the outcome."""

    request = JobRequest(
        dataset_id=dataset_id,
        kind=JobKind(payload.kind),
        profile_id=payload.profile_id,
        parameters=dict(payload.parameters),
    )
    row = service.run(request)
    return _to_response(row)


@router.get(
    "/{dataset_id}/jobs",
    response_model=JobListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List durable analysis jobs for a dataset",
    operation_id="list_dataset_jobs",
)
def list_dataset_jobs(
    dataset_id: UUID,
    service: Annotated[
        JobService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_job_service"]
            ).get_job_service
        ),
    ],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> JobListResponse:
    """Return a paginated list of ``Job`` rows for a dataset."""

    items, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return JobListResponse(
        items=[_to_response(row) for row in items],
        pagination=_pagination(page, page_size, total_items),
    )


@router.get(
    "/jobs/{job_id}",
    response_model=JobResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Return a specific durable analysis job",
    operation_id="get_dataset_job",
)
def get_dataset_job(
    job_id: UUID,
    service: Annotated[
        JobService,
        Depends(
            __import__(
                "app.api.dependencies", fromlist=["get_job_service"]
            ).get_job_service
        ),
    ],
) -> JobResponse:
    """Return a single persisted ``Job`` row by id."""

    row = service.get_job(job_id)
    return _to_response(row)


__all__ = ["_to_response", "router"]
