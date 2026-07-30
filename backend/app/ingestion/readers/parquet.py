"""Metadata-only Parquet inspection through the Arrow footer and schema."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from app.ingestion.exceptions import InvalidDatasetFileError
from app.ingestion.types import ColumnMetadata, DatasetMetadata, LogicalDataType
from app.ingestion.validators.files import validate_column_names


def _logical_type(data_type: pa.DataType) -> LogicalDataType:
    if pa.types.is_boolean(data_type):
        return LogicalDataType.BOOLEAN
    if pa.types.is_integer(data_type):
        return LogicalDataType.INTEGER
    if pa.types.is_floating(data_type):
        return LogicalDataType.FLOAT
    if pa.types.is_decimal(data_type):
        return LogicalDataType.DECIMAL
    if pa.types.is_string(data_type) or pa.types.is_large_string(data_type):
        return LogicalDataType.STRING
    if pa.types.is_dictionary(data_type):
        return LogicalDataType.STRING
    if pa.types.is_date(data_type):
        return LogicalDataType.DATE
    if pa.types.is_timestamp(data_type):
        return LogicalDataType.DATETIME
    if pa.types.is_time(data_type):
        return LogicalDataType.TIME
    if pa.types.is_duration(data_type):
        return LogicalDataType.DURATION
    if pa.types.is_binary(data_type) or pa.types.is_large_binary(data_type):
        return LogicalDataType.BINARY
    if pa.types.is_list(data_type) or pa.types.is_large_list(data_type):
        return LogicalDataType.LIST
    if pa.types.is_fixed_size_list(data_type):
        return LogicalDataType.LIST
    if pa.types.is_struct(data_type):
        return LogicalDataType.STRUCT
    return LogicalDataType.UNKNOWN


def _physical_type(data_type: pa.DataType) -> str:
    logical_type = _logical_type(data_type)
    if logical_type in {LogicalDataType.LIST, LogicalDataType.STRUCT}:
        return logical_type.value
    return str(data_type)


class ParquetMetadataReader:
    """Read row count and schema from Parquet metadata without materializing row groups."""

    def read_metadata(self, path: Path) -> DatasetMetadata:
        try:
            parquet_file = pq.ParquetFile(path)
            arrow_schema = parquet_file.schema_arrow
            metadata = parquet_file.metadata
        except (OSError, pa.ArrowInvalid, pa.ArrowIOError) as exc:
            raise InvalidDatasetFileError("parquet_metadata_failed") from exc

        names = arrow_schema.names
        validate_column_names(names)
        columns = tuple(
            ColumnMetadata(
                name=field.name,
                ordinal_position=position,
                physical_type=_physical_type(field.type),
                logical_type=_logical_type(field.type),
                nullable=field.nullable,
            )
            for position, field in enumerate(arrow_schema, start=1)
        )
        return DatasetMetadata(row_count=metadata.num_rows, columns=columns)
