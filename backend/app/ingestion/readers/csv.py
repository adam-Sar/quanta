"""Streaming structural metadata extraction for UTF-8 comma-separated files."""

from pathlib import Path

import polars as pl

from app.ingestion.exceptions import InvalidDatasetFileError
from app.ingestion.types import ColumnMetadata, DatasetMetadata, LogicalDataType


def _logical_type(dtype: pl.DataType) -> LogicalDataType:
    if dtype == pl.Boolean:
        return LogicalDataType.BOOLEAN
    if dtype.is_integer():
        return LogicalDataType.INTEGER
    if dtype.is_float():
        return LogicalDataType.FLOAT
    if dtype.is_decimal():
        return LogicalDataType.DECIMAL
    if dtype in {pl.String, pl.Categorical, pl.Enum}:
        return LogicalDataType.STRING
    if dtype == pl.Date:
        return LogicalDataType.DATE
    if isinstance(dtype, pl.Datetime):
        return LogicalDataType.DATETIME
    if dtype == pl.Time:
        return LogicalDataType.TIME
    if isinstance(dtype, pl.Duration):
        return LogicalDataType.DURATION
    if dtype == pl.Binary:
        return LogicalDataType.BINARY
    if isinstance(dtype, (pl.List, pl.Array)):
        return LogicalDataType.LIST
    if isinstance(dtype, pl.Struct):
        return LogicalDataType.STRUCT
    return LogicalDataType.UNKNOWN


def _physical_type(dtype: pl.DataType) -> str:
    if isinstance(dtype, pl.Struct):
        return "struct"
    if isinstance(dtype, (pl.List, pl.Array)):
        return "list"
    return str(dtype)


class CsvMetadataReader:
    """Infer a bounded schema sample, then count rows through Polars streaming execution."""

    def __init__(self, infer_schema_length: int) -> None:
        self.infer_schema_length = infer_schema_length

    def read_metadata(self, path: Path) -> DatasetMetadata:
        try:
            lazy_frame = pl.scan_csv(
                path,
                has_header=True,
                infer_schema_length=self.infer_schema_length,
                try_parse_dates=True,
                encoding="utf8",
                ignore_errors=False,
                raise_if_empty=True,
            )
            schema = lazy_frame.collect_schema()
            row_count_frame = lazy_frame.select(pl.len().alias("row_count")).collect(
                engine="streaming"
            )
            row_count = int(row_count_frame.item(0, "row_count"))
        except (OSError, UnicodeError, pl.exceptions.PolarsError, ValueError) as exc:
            raise InvalidDatasetFileError("csv_parse_failed") from exc

        columns = tuple(
            ColumnMetadata(
                name=name,
                ordinal_position=position,
                physical_type=_physical_type(dtype),
                logical_type=_logical_type(dtype),
                nullable=None,
            )
            for position, (name, dtype) in enumerate(schema.items(), start=1)
        )
        if not columns:
            raise InvalidDatasetFileError("missing_columns")
        return DatasetMetadata(row_count=row_count, columns=columns)
