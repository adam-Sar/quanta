"""Unit tests for CSV and Parquet metadata readers."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from app.ingestion.exceptions import InvalidDatasetFileError
from app.ingestion.readers import CsvMetadataReader, ParquetMetadataReader
from app.ingestion.types import DatasetFormat, LogicalDataType


def test_csv_reader_extracts_rows_types_and_order(tmp_path: Path) -> None:
    csv_path = tmp_path / "people.csv"
    csv_path.write_text(
        "id,name,joined_at,active\n"
        "1,alice,2024-01-02,true\n"
        "2,bob,2024-02-15,false\n"
        "3,carol,2024-03-30,true\n",
        encoding="utf-8",
    )

    metadata = CsvMetadataReader(infer_schema_length=10_000).read_metadata(csv_path)

    assert metadata.row_count == 3
    assert metadata.column_count == 4
    types = {column.name: column.logical_type for column in metadata.columns}
    assert types["id"] == LogicalDataType.INTEGER
    assert types["name"] == LogicalDataType.STRING
    assert types["joined_at"] == LogicalDataType.DATE
    assert types["active"] == LogicalDataType.BOOLEAN
    ordinals = [column.ordinal_position for column in metadata.columns]
    assert ordinals == [1, 2, 3, 4]
    assert [column.name for column in metadata.columns] == [
        "id",
        "name",
        "joined_at",
        "active",
    ]


def test_csv_reader_handles_typed_numeric_columns(tmp_path: Path) -> None:
    csv_path = tmp_path / "numbers.csv"
    csv_path.write_text("a,b\n1,1.5\n2,2.5\n", encoding="utf-8")

    metadata = CsvMetadataReader(infer_schema_length=10_000).read_metadata(csv_path)

    types = {column.name: column.logical_type for column in metadata.columns}
    assert types["a"] == LogicalDataType.INTEGER
    assert types["b"] == LogicalDataType.FLOAT


def test_csv_reader_handles_mixed_types_as_string(tmp_path: Path) -> None:
    # Polars promotes mixed numeric/text columns to string at the metadata layer.
    csv_path = tmp_path / "broken.csv"
    csv_path.write_text("id,value\n1,not-a-number\n2,2\n", encoding="utf-8")

    metadata = CsvMetadataReader(infer_schema_length=10_000).read_metadata(csv_path)

    types = {column.name: column.logical_type for column in metadata.columns}
    assert types["value"] == LogicalDataType.STRING
    assert metadata.row_count == 2


def test_parquet_reader_extracts_rows_and_schema(tmp_path: Path) -> None:
    table = pa.table(
        {
            "id": pa.array([1, 2, 3], type=pa.int64()),
            "country": pa.array(["US", "US", "DE"], type=pa.string()),
            "score": pa.array([1.1, 2.2, 3.3], type=pa.float64()),
        }
    )
    file_path = tmp_path / "data.parquet"
    pq.write_table(table, file_path)

    metadata = ParquetMetadataReader().read_metadata(file_path)

    assert metadata.row_count == 3
    assert [column.name for column in metadata.columns] == ["id", "country", "score"]
    types = {column.name: column.logical_type for column in metadata.columns}
    assert types["id"] == LogicalDataType.INTEGER
    assert types["country"] == LogicalDataType.STRING
    assert types["score"] == LogicalDataType.FLOAT
    assert all(column.nullable is True for column in metadata.columns)


def test_parquet_reader_rejects_invalid_signature(tmp_path: Path) -> None:
    file_path = tmp_path / "broken.parquet"
    file_path.write_bytes(b"not-a-parquet-file")

    with pytest.raises(InvalidDatasetFileError):
        ParquetMetadataReader().read_metadata(file_path)


def test_registry_dispatches_by_format(tmp_path: Path) -> None:
    from app.ingestion.readers import MetadataReaderRegistry

    csv_path = tmp_path / "data.csv"
    csv_path.write_text("id\n1\n2\n", encoding="utf-8")
    registry = MetadataReaderRegistry(
        {
            DatasetFormat.CSV: CsvMetadataReader(infer_schema_length=10),
        }
    )
    assert registry.read(DatasetFormat.CSV, csv_path).row_count == 2
    with pytest.raises(Exception):  # noqa: B017
        registry.read(DatasetFormat.PARQUET, csv_path)
