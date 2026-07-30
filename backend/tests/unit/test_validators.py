"""Unit tests for upload validation rules."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from app.ingestion.exceptions import (
    InvalidDatasetFileError,
    InvalidFilenameError,
    UnsupportedFileFormatError,
)
from app.ingestion.types import DatasetFormat, StagedUpload
from app.ingestion.validators.files import (
    DatasetFileValidator,
    normalize_original_filename,
    validate_column_names,
)


def _write(path: Path, payload: bytes) -> StagedUpload:
    path.write_bytes(payload)
    return StagedUpload(
        path=path,
        original_filename=path.name,
        size_bytes=path.stat().st_size,
        content_sha256="0" * 64,
        media_type=None,
    )


def test_normalize_filename_strips_directories_and_backslashes() -> None:
    assert normalize_original_filename("../etc/passwd") == "passwd"
    assert normalize_original_filename(r"C:\\Users\\me\\data.csv") == "data.csv"
    assert normalize_original_filename("plain.csv") == "plain.csv"


@pytest.mark.parametrize("value", [None, "", ".", "..", " " + "x" * 600])
def test_normalize_filename_rejects_bad_values(value: str | None) -> None:
    with pytest.raises(InvalidFilenameError):
        normalize_original_filename(value)


def test_validate_column_names_rejects_duplicates_and_blanks() -> None:
    validate_column_names(["id", "name", "country"])
    with pytest.raises(InvalidDatasetFileError) as exc:
        validate_column_names(["id", "id"])
    assert exc.value.details and exc.value.details["reason"] == "duplicate_column_names"
    with pytest.raises(InvalidDatasetFileError) as exc:
        validate_column_names(["id", "   "])
    assert exc.value.details and exc.value.details["reason"] == "blank_column_name"


def test_validator_recognises_csv_with_header(tmp_path: Path) -> None:
    validator = DatasetFileValidator()
    staged = _write(tmp_path / "people.csv", b"id,name\n1,alice\n")

    assert validator.validate(staged) == DatasetFormat.CSV


def test_validator_rejects_empty_csv(tmp_path: Path) -> None:
    validator = DatasetFileValidator()
    staged = _write(tmp_path / "empty.csv", b"")

    with pytest.raises(InvalidDatasetFileError) as exc:
        validator.validate(staged)
    assert exc.value.details and exc.value.details["reason"] == "missing_csv_header"


def test_validator_rejects_duplicate_csv_columns(tmp_path: Path) -> None:
    validator = DatasetFileValidator()
    staged = _write(tmp_path / "dupe.csv", b"id,id\n1,2\n")

    with pytest.raises(InvalidDatasetFileError) as exc:
        validator.validate(staged)
    assert exc.value.details and exc.value.details["reason"] == "duplicate_column_names"


def test_validator_rejects_non_utf8_csv(tmp_path: Path) -> None:
    validator = DatasetFileValidator()
    staged = _write(tmp_path / "latin1.csv", "id,name\n1,ünknown\n".encode("latin-1"))

    with pytest.raises(InvalidDatasetFileError) as exc:
        validator.validate(staged)
    assert exc.value.details and exc.value.details["reason"] == "invalid_csv_header"


def test_validator_recognises_valid_parquet(tmp_path: Path) -> None:
    table = pa.table({"id": [1, 2, 3], "name": ["a", "b", "c"]})
    file_path = tmp_path / "data.parquet"
    pq.write_table(table, file_path)
    staged = _write(file_path, file_path.read_bytes())

    assert DatasetFileValidator().validate(staged) == DatasetFormat.PARQUET


def test_validator_rejects_invalid_parquet_signature(tmp_path: Path) -> None:
    staged = _write(tmp_path / "broken.parquet", b"not-a-parquet-file")

    with pytest.raises(InvalidDatasetFileError) as exc:
        DatasetFileValidator().validate(staged)
    assert exc.value.details and exc.value.details["reason"] == "invalid_parquet_signature"


def test_validator_rejects_unknown_extension(tmp_path: Path) -> None:
    staged = _write(tmp_path / "data.txt", b"anything")

    with pytest.raises(UnsupportedFileFormatError):
        DatasetFileValidator().validate(staged)
