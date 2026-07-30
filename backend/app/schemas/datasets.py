"""Public Pydantic contracts for dataset ingestion and retrieval."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.ingestion.types import DatasetFormat, DatasetVersionStatus, LogicalDataType
from app.schemas.common import ApiModel

_MAX_NAME_LENGTH = 255
_MAX_DESCRIPTION_LENGTH = 2000


class Pagination(ApiModel):
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total_items: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class DatasetColumnResponse(ApiModel):
    name: str
    ordinal_position: int = Field(ge=1)
    physical_type: str
    logical_type: LogicalDataType
    nullable: bool | None


class DatasetVersionResponse(ApiModel):
    id: UUID
    version_number: int = Field(ge=1)
    format: DatasetFormat
    status: DatasetVersionStatus
    original_filename: str
    media_type: str | None
    size_bytes: int = Field(ge=0)
    row_count: int = Field(ge=0)
    column_count: int = Field(ge=0)
    content_sha256: str
    created_at: datetime
    columns: list[DatasetColumnResponse]


class DatasetResponse(ApiModel):
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    current_version: DatasetVersionResponse | None


class DatasetListResponse(ApiModel):
    items: list[DatasetResponse]
    pagination: Pagination


class DatasetVersionListResponse(ApiModel):
    items: list[DatasetVersionResponse]
    pagination: Pagination


class DatasetCreateForm(ApiModel):
    """Form-modeled metadata for the multipart upload endpoint."""

    name: str = Field(min_length=1, max_length=_MAX_NAME_LENGTH)
    description: str | None = Field(default=None, max_length=_MAX_DESCRIPTION_LENGTH)

    @field_validator("name")
    @classmethod
    def strip_and_require(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("name must not be blank")
        return trimmed

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


UploadLiteral = Literal["file"]
