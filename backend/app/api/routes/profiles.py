"""HTTP routes for deterministic dataset profiling (Task 3)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.dependencies import get_profiling_service
from app.db.models.profile import DatasetProfile
from app.profiling.service import ProfilingService, to_api_profile
from app.schemas.common import ErrorResponse
from app.schemas.datasets import Pagination
from app.schemas.profiles import (
    ColumnProfileMetricsResponse,
    ColumnProfileResponse,
    DatasetProfileListResponse,
    DatasetProfileResponse,
    NumericMetricsResponse,
    StringLengthMetricsResponse,
    TemporalMetricsResponse,
    TopValueResponse,
)

router = APIRouter(prefix="/datasets", tags=["profiles"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _to_column_response(column: object) -> ColumnProfileResponse:
    metrics = column.metrics  # type: ignore[attr-defined]
    numeric = metrics["numeric"]
    temporal = metrics["temporal"]
    string_length = metrics["string_length"]
    return ColumnProfileResponse(
        name=column.name,  # type: ignore[attr-defined]
        ordinal_position=column.ordinal_position,  # type: ignore[attr-defined]
        metrics=ColumnProfileMetricsResponse(
            physical_type=metrics["physical_type"],
            sample_size=metrics["sample_size"],
            non_null_count=metrics["non_null_count"],
            null_count=metrics["null_count"],
            null_rate=metrics["null_rate"],
            distinct_count=metrics["distinct_count"],
            distinct_rate=metrics["distinct_rate"],
            top_values=[
                TopValueResponse(
                    value=item["value"],
                    count=item["count"],
                    frequency=item["frequency"],
                )
                for item in metrics["top_values"]
            ],
            numeric=NumericMetricsResponse(
                min=numeric["min"],
                max=numeric["max"],
                mean=numeric["mean"],
                median=numeric["median"],
                std=numeric["std"],
                sum=numeric["sum"],
            ),
            temporal=TemporalMetricsResponse(
                min=temporal["min"],
                max=temporal["max"],
            ),
            string_length=StringLengthMetricsResponse(
                min=string_length["min"],
                max=string_length["max"],
                mean=string_length["mean"],
            ),
        ),
    )


def _to_profile_response(profile: DatasetProfile) -> DatasetProfileResponse:
    domain = to_api_profile(profile)
    return DatasetProfileResponse(
        profile_id=domain.profile_id,
        dataset_id=domain.dataset_id,
        dataset_version_id=domain.dataset_version_id,
        sample_size=domain.sample_size,
        sampled=domain.sampled.value,
        started_at=domain.started_at,
        completed_at=domain.completed_at,
        duration_ms=domain.duration_ms,
        columns=[_to_column_response(column) for column in domain.columns],
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
    "/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Profile the latest version of a dataset",
    operation_id="create_dataset_profile",
)
def create_dataset_profile(
    dataset_id: UUID,
    service: Annotated[ProfilingService, Depends(get_profiling_service)],
) -> DatasetProfileResponse:
    """Compute a fresh deterministic profile and persist a new row."""

    profile = service.profile_latest_version(dataset_id)
    return _to_profile_response(profile)


@router.get(
    "/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Get the latest profile for a dataset",
    operation_id="get_dataset_profile",
)
def get_dataset_profile(
    dataset_id: UUID,
    service: Annotated[ProfilingService, Depends(get_profiling_service)],
) -> DatasetProfileResponse:
    """Return the most recently created profile for the dataset's latest version."""

    profile = service.get_latest(dataset_id)
    if profile is None:
        from app.profiling.exceptions import DatasetNotProfileableError

        raise DatasetNotProfileableError()
    return _to_profile_response(profile)


@router.get(
    "/{dataset_id}/versions/{version_id}/profile",
    response_model=DatasetProfileResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Get the latest profile for a dataset version",
    operation_id="get_dataset_version_profile",
)
def get_dataset_version_profile(
    dataset_id: UUID,
    version_id: UUID,
    service: Annotated[ProfilingService, Depends(get_profiling_service)],
) -> DatasetProfileResponse:
    """Return the most recently created profile for a specific immutable version."""

    profile = service.get_for_version(dataset_id, version_id)
    if profile is None:
        from app.profiling.exceptions import DatasetNotProfileableError

        raise DatasetNotProfileableError()
    return _to_profile_response(profile)


@router.get(
    "/{dataset_id}/profiles",
    response_model=DatasetProfileListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List profile runs for a dataset",
    operation_id="list_dataset_profiles",
)
def list_dataset_profiles(
    dataset_id: UUID,
    service: Annotated[ProfilingService, Depends(get_profiling_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> DatasetProfileListResponse:
    """Return a paginated list of profile runs ordered by creation time desc."""

    profiles, total_items = service.list_for_dataset(
        dataset_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return DatasetProfileListResponse(
        items=[_to_profile_response(profile) for profile in profiles],
        pagination=_pagination(page, page_size, total_items),
    )