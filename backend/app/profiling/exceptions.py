"""Profile failure types that map to safe HTTP responses."""

from http import HTTPStatus

from app.core.exceptions import ApplicationError


class ProfileError(ApplicationError):
    """Base error for the profiling layer."""


class DatasetNotProfileableError(ProfileError):
    def __init__(self) -> None:
        super().__init__(
            code="dataset_not_profileable",
            message="The dataset has no profileable version yet.",
            status_code=HTTPStatus.CONFLICT,
        )


class InvalidProfileStateError(ProfileError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="invalid_profile_state",
            message="The dataset cannot be profiled in its current state.",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details={"reason": reason},
        )


class ProfileStorageError(ProfileError):
    def __init__(self) -> None:
        super().__init__(
            code="profile_storage_error",
            message="The original dataset file could not be read for profiling.",
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
        )
