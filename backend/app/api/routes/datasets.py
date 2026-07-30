"""HTTP routes for dataset ingestion and inspection."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.api.dependencies import get_dataset_service
from app.db.models.dataset import Dataset, DatasetVersion
from app.schemas.common import ErrorResponse
from app.schemas.datasets import (
    DatasetColumnResponse,
    DatasetCreateForm,
    DatasetListResponse,
    DatasetResponse,
    DatasetVersionListResponse,
    DatasetVersionResponse,
    Pagination,
)
from app.services.dataset_service import DatasetService, Page

router = APIRouter(prefix="/datasets", tags=["datasets"])

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _to_version_response(version: DatasetVersion) -> DatasetVersionResponse:
    return DatasetVersionResponse(
        id=version.id,
        version_number=version.version_number,
        format=version.format,
        status=version.status,
        original_filename=version.original_filename,
        media_type=version.media_type,
        size_bytes=version.size_bytes,
        row_count=version.row_count,
        column_count=version.column_count,
        content_sha256=version.content_sha256,
        created_at=version.created_at,
        columns=[
            DatasetColumnResponse(
                name=column.name,
                ordinal_position=column.ordinal_position,
                physical_type=column.physical_type,
                logical_type=column.logical_type,
                nullable=column.nullable,
            )
            for column in version.columns
        ],
    )


def _to_dataset_response(dataset: Dataset) -> DatasetResponse:
    current = max(dataset.versions, key=lambda v: v.version_number, default=None)
    return DatasetResponse(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
        current_version=_to_version_response(current) if current is not None else None,
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
    "",
    response_model=DatasetResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
    summary="Upload a new dataset",
    operation_id="create_dataset",
)
def create_dataset(
    file: Annotated[UploadFile, File(description="CSV or Parquet file to ingest")],
    name: Annotated[str, Form(min_length=1, max_length=255)],
    service: Annotated[DatasetService, Depends(get_dataset_service)],
    description: Annotated[str | None, Form(max_length=2000)] = None,
) -> DatasetResponse:
    """Stream the upload, validate it, and persist the first immutable version."""

    form = DatasetCreateForm(name=name, description=description)
    file.file.seek(0)
    dataset = service.ingest(
        upload=file,
        name=form.name,
        description=form.description,
    )
    return _to_dataset_response(dataset)


@router.get(
    "",
    response_model=DatasetListResponse,
    summary="List datasets",
    operation_id="list_datasets",
)
def list_datasets(
    service: Annotated[DatasetService, Depends(get_dataset_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> DatasetListResponse:
    """List datasets with paginated versions eager-loaded for response rendering."""

    result: Page[Dataset] = service.list_datasets(page=page, page_size=page_size)
    return DatasetListResponse(
        items=[_to_dataset_response(dataset) for dataset in result.items],
        pagination=_pagination(page, page_size, result.total_items),
    )


@router.get(
    "/{dataset_id}",
    response_model=DatasetResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get a dataset",
    operation_id="get_dataset",
)
def get_dataset(
    dataset_id: UUID,
    service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetResponse:
    return _to_dataset_response(service.get(dataset_id))


@router.get(
    "/{dataset_id}/versions",
    response_model=DatasetVersionListResponse,
    responses={404: {"model": ErrorResponse}},
    summary="List versions of a dataset",
    operation_id="list_dataset_versions",
)
def list_dataset_versions(
    dataset_id: UUID,
    service: Annotated[DatasetService, Depends(get_dataset_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
) -> DatasetVersionListResponse:
    result: Page[DatasetVersion] = service.list_versions(dataset_id, page=page, page_size=page_size)
    return DatasetVersionListResponse(
        items=[_to_version_response(version) for version in result.items],
        pagination=_pagination(page, page_size, result.total_items),
    )
