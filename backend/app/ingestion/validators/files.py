"""Content-aware validation for staged CSV and Parquet uploads."""

import csv
from pathlib import Path, PurePosixPath

from app.ingestion.exceptions import (
    InvalidDatasetFileError,
    InvalidFilenameError,
    UnsupportedFileFormatError,
)
from app.ingestion.types import DatasetFormat, StagedUpload

_PARQUET_MAGIC = b"PAR1"
_MAX_FILENAME_LENGTH = 512
_MAX_COLUMN_NAME_LENGTH = 255


def normalize_original_filename(filename: str | None) -> str:
    """Remove browser/client path components while preserving audit-friendly basename."""

    if filename is None:
        raise InvalidFilenameError
    basename = PurePosixPath(filename.replace("\\", "/")).name
    if (
        not basename
        or basename in {".", ".."}
        or len(basename) > _MAX_FILENAME_LENGTH
        or any(ord(character) < 32 for character in basename)
    ):
        raise InvalidFilenameError
    return basename


def validate_column_names(names: list[str]) -> None:
    if not names:
        raise InvalidDatasetFileError("missing_columns")
    if any(not name.strip() for name in names):
        raise InvalidDatasetFileError("blank_column_name")
    if any(len(name) > _MAX_COLUMN_NAME_LENGTH for name in names):
        raise InvalidDatasetFileError("column_name_too_long")
    if len(set(names)) != len(names):
        raise InvalidDatasetFileError("duplicate_column_names")


class DatasetFileValidator:
    """Determine format from a trusted extension plus format-specific content checks."""

    def validate(self, staged: StagedUpload) -> DatasetFormat:
        suffix = Path(staged.original_filename).suffix.casefold()
        if suffix == ".parquet":
            self._validate_parquet_signature(staged.path, staged.size_bytes)
            return DatasetFormat.PARQUET
        if suffix == ".csv":
            self._validate_csv_header(staged.path)
            return DatasetFormat.CSV
        raise UnsupportedFileFormatError

    @staticmethod
    def _validate_parquet_signature(path: Path, size_bytes: int) -> None:
        if size_bytes < 8:
            raise InvalidDatasetFileError("invalid_parquet_signature")
        with path.open("rb") as source:
            first_magic = source.read(4)
            source.seek(-4, 2)
            last_magic = source.read(4)
        if first_magic != _PARQUET_MAGIC or last_magic != _PARQUET_MAGIC:
            raise InvalidDatasetFileError("invalid_parquet_signature")

    @staticmethod
    def _validate_csv_header(path: Path) -> None:
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as source:
                reader = csv.reader(source, strict=True)
                header = next(reader, None)
        except (UnicodeDecodeError, csv.Error) as exc:
            raise InvalidDatasetFileError("invalid_csv_header") from exc
        if header is None:
            raise InvalidDatasetFileError("missing_csv_header")
        validate_column_names(header)
