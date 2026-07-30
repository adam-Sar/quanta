"""Safe public failures produced by the ingestion boundary."""

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class EmptyUploadError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            code="empty_upload",
            message="The uploaded file is empty.",
            status_code=HTTPStatus.BAD_REQUEST,
        )


class UploadTooLargeError(ApplicationError):
    def __init__(self, max_size_bytes: int) -> None:
        super().__init__(
            code="upload_too_large",
            message="The uploaded file exceeds the configured size limit.",
            status_code=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            details={"max_size_bytes": max_size_bytes},
        )


class UnsupportedFileFormatError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            code="unsupported_file_format",
            message="Only CSV and Parquet files are supported.",
            status_code=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            details={"supported_extensions": [".csv", ".parquet"]},
        )


class InvalidDatasetFileError(ApplicationError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_dataset_file",
            message="The uploaded file is not a valid supported dataset.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )


class InvalidFilenameError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            code="invalid_filename",
            message="The upload must include a valid filename.",
            status_code=HTTPStatus.BAD_REQUEST,
        )
