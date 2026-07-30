"""Public service-layer resource failures."""

from http import HTTPStatus
from uuid import UUID

from app.core.exceptions import ApplicationError


class DatasetNotFoundError(ApplicationError):
    def __init__(self, dataset_id: UUID) -> None:
        super().__init__(
            code="dataset_not_found",
            message="The requested dataset does not exist.",
            status_code=HTTPStatus.NOT_FOUND,
            details={"dataset_id": str(dataset_id)},
        )
