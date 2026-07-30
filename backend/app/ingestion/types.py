"""Shared ingestion domain types independent of HTTP and persistence layers."""

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class DatasetFormat(StrEnum):
    CSV = "csv"
    PARQUET = "parquet"


class DatasetVersionStatus(StrEnum):
    STORED = "stored"


class LogicalDataType(StrEnum):
    BOOLEAN = "boolean"
    INTEGER = "integer"
    FLOAT = "float"
    DECIMAL = "decimal"
    STRING = "string"
    DATE = "date"
    DATETIME = "datetime"
    TIME = "time"
    DURATION = "duration"
    BINARY = "binary"
    LIST = "list"
    STRUCT = "struct"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class ColumnMetadata:
    name: str
    ordinal_position: int
    physical_type: str
    logical_type: LogicalDataType
    nullable: bool | None


@dataclass(frozen=True, slots=True)
class DatasetMetadata:
    row_count: int
    columns: tuple[ColumnMetadata, ...]

    @property
    def column_count(self) -> int:
        return len(self.columns)


@dataclass(frozen=True, slots=True)
class StagedUpload:
    path: Path
    original_filename: str
    size_bytes: int
    content_sha256: str
    media_type: str | None
