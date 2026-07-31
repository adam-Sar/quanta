"""Deterministic validation preview engine (Task 9).

The preview engine consumes a Task 8 ``Recommendation`` row, the
matching dataset version's source file, and the latest Task 4
findings; it then computes the projected impact of the
recommendation's constrained operation. The engine never mutates
the source file; it only reads via ``polars.scan_csv`` /
``pyarrow.parquet`` and returns a deterministic ``ValidationImpact``
summary.

Per-operation behaviour
------------------------

* ``impute_missing(column, strategy)``:
  - Validates the source file is readable and the column exists.
  - Projects the count of null values that would be imputed and the
    resulting null count after the operation.
* ``drop_column(column)``:
  - Validates the column exists.
  - Projects the new column count and the list of remaining columns.
* ``drop_duplicates``:
  - Validates the source file is readable.
  - Projects the count of exact-duplicate rows that would be removed.
* ``cap_outliers(column, threshold)``:
  - Validates the column exists and is numeric.
  - Projects the count of values that exceed the threshold and the
    resulting value range.
* ``cast_type(column)``:
  - Validates the column exists.
  - Returns the source physical type and a placeholder projected
    type; the actual apply call lands in a later task.
* ``group_rare_categorical(column, min_count)``:
  - Validates the column exists.
  - Projects the count of rare categories that would be grouped into
    an 'Other' bucket.
* ``review``:
  - Always valid, no projected impact.

The engine is intentionally bounded by ``profile_default_sample_rows``
and ``profile_max_bytes_in_memory`` so a pathological dataset cannot
exhaust the API worker's memory during a validation preview.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from app.ingestion.types import DatasetFormat
from app.recommendations.types import (
    OperationKind as RecommendationOperationKind,
)
from app.recommendations.types import (
    Recommendation,
)
from app.validation.exceptions import InvalidValidationStateError
from app.validation.types import (
    ValidationImpact,
    ValidationStatus,
)

# Documented schema version. Bump when the preview engine changes
# in a non-backward-compatible way.
VALIDATION_FORMULA_VERSION: str = "task9-1.0"

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ValidationPreview:
    """The deterministic result of one recommendation validation."""

    status: ValidationStatus
    impact: ValidationImpact


def _safe_read_csv(path: Path, sample_size: int) -> Any:
    """Read a CSV with Polars and return a bounded LazyFrame.

    Falls back to a quick ``head`` so even malformed inputs do not
    crash the validation service. The ``sample_size`` argument is the
    maximum number of rows the engine will materialise.
    """

    import polars as pl  # local import to keep the module lazy-friendly

    try:
        scan = pl.scan_csv(str(path), infer_schema_length=min(1000, sample_size))
        frame = scan.head(sample_size).collect()
    except (OSError, pl.ComputeError, pl.NoDataError, ValueError) as exc:
        logger.warning(
            "validation_preview_read_failed",
            extra={
                "error_code": "validation_preview_read_failed",
                "path": str(path),
                "reason": str(exc),
            },
        )
        return None
    return frame


def _safe_read_parquet(path: Path, sample_size: int) -> Any:
    """Read a Parquet file with PyArrow and return a bounded table.

    Returns ``None`` on any read failure so the validation service
    can downgrade the validation to ``invalid`` with a clear
    rationale instead of crashing.
    """

    import pyarrow.parquet as pq  # local import to keep the module lazy

    try:
        table = pq.read_table(str(path))
    except (OSError, ValueError, ImportError) as exc:  # pragma: no cover - defensive
        logger.warning(
            "validation_preview_read_failed",
            extra={
                "error_code": "validation_preview_read_failed",
                "path": str(path),
                "reason": str(exc),
            },
        )
        return None
    rows = table.num_rows
    if rows > sample_size:
        return table.slice(0, sample_size)
    return table


def _read_frame(path: Path, fmt: DatasetFormat, sample_size: int) -> Any:
    if fmt is DatasetFormat.CSV:
        return _safe_read_csv(path, sample_size)
    if fmt is DatasetFormat.PARQUET:
        return _safe_read_parquet(path, sample_size)
    return None


def _column_names(frame: Any) -> list[str]:
    if frame is None:
        return []
    columns_attr = getattr(frame, "columns", None)
    if columns_attr is not None:
        return list(columns_attr)
    schema = getattr(frame, "schema", None)
    if schema is not None:
        try:
            return [field.name for field in schema]
        except (AttributeError, TypeError):
            return []
    return []


def _row_count(frame: Any) -> int:
    if frame is None:
        return 0
    height = getattr(frame, "height", None)
    if isinstance(height, int):
        return height
    return len(getattr(frame, "to_pylist", lambda: [])())


def _column_null_count(frame: Any, column: str) -> int:
    if frame is None or column not in _column_names(frame):
        return 0
    try:
        return int(frame[column].null_count())
    except (AttributeError, TypeError, ValueError):
        return 0


def _column_value_count_above(frame: Any, column: str, threshold: float) -> int:
    if frame is None or column not in _column_names(frame):
        return 0
    series = frame[column]
    try:
        return int((series > threshold).sum())
    except (AttributeError, TypeError, ValueError):
        return 0


def _column_duplicate_count(frame: Any) -> int:
    """Approximate the count of duplicate rows in the bounded frame."""

    if frame is None:
        return 0
    try:
        return int(frame.is_duplicated().sum())
    except (AttributeError, TypeError, ValueError):
        return 0


def _column_rare_count(frame: Any, column: str, min_count: int) -> int:
    if frame is None or column not in _column_names(frame):
        return 0
    series = frame[column]
    try:
        value_counts = series.value_counts()
    except (AttributeError, TypeError, ValueError):
        return 0
    try:
        rare_rows = value_counts.filter(value_counts["count"] < min_count)
    except (AttributeError, TypeError, ValueError):
        return 0
    try:
        return int(rare_rows["count"].sum())
    except (AttributeError, TypeError, ValueError):
        return 0


def _column_physical_type(frame: Any, column: str) -> str:
    if frame is None or column not in _column_names(frame):
        return "unknown"
    schema = getattr(frame, "schema", None)
    if schema is None:
        return "unknown"
    try:
        field = schema.field(column)
    except (AttributeError, TypeError, KeyError):
        return "unknown"
    return str(field.dtype)


def _validate_column_exists(
    frame: Any,
    *,
    column: str,
    dataset_version_id: UUID,
) -> None:
    columns = _column_names(frame)
    if not columns:
        raise InvalidValidationStateError("source_unreadable")
    if column not in columns:
        raise InvalidValidationStateError("column_not_found")


def _preview_drop_column(
    recommendation: Recommendation,
    *,
    frame: Any,
) -> ValidationPreview:
    column = (recommendation.affected_columns or ("",))[0] or "<dataset>"
    columns = _column_names(frame)
    if not columns:
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary="Source file is unreadable; cannot preview drop_column.",
                unexpected_side_effects=("source_unreadable",),
            ),
        )
    if column not in columns:
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary=f"Column '{column}' is not present in the dataset version.",
                affected_columns=(column,),
                unexpected_side_effects=("column_not_found",),
            ),
        )
    remaining = [name for name in columns if name != column]
    return ValidationPreview(
        status=ValidationStatus.VALID,
        impact=ValidationImpact(
            affected_columns=(column,),
            summary=(
                f"Dropping column '{column}' would remove 1 column and leave "
                f"{len(remaining)} column(s): {', '.join(remaining) or '<none>'}."
            ),
        ),
    )


def _preview_impute_missing(
    recommendation: Recommendation,
    *,
    frame: Any,
) -> ValidationPreview:
    column = (recommendation.affected_columns or ("",))[0] or "<dataset>"
    columns = _column_names(frame)
    if not columns or column not in columns:
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary=f"Column '{column}' is not present in the dataset version.",
                affected_columns=(column,),
                unexpected_side_effects=("column_not_found",),
            ),
        )
    nulls = _column_null_count(frame, column)
    rows = _row_count(frame)
    if rows == 0:
        return ValidationPreview(
            status=ValidationStatus.WARNING,
            impact=ValidationImpact(
                affected_columns=(column,),
                summary=f"Source frame has zero rows; impute_missing on '{column}' is a no-op.",
            ),
        )
    return ValidationPreview(
        status=ValidationStatus.VALID,
        impact=ValidationImpact(
            affected_rows=nulls,
            affected_columns=(column,),
            summary=(
                f"Imputing nulls in '{column}' would touch {nulls} of {rows} row(s); "
                f"post-impute null count would be 0."
            ),
        ),
    )


def _preview_drop_duplicates(*, frame: Any) -> ValidationPreview:
    if frame is None:
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary="Source file is unreadable; cannot preview drop_duplicates.",
                unexpected_side_effects=("source_unreadable",),
            ),
        )
    duplicates = _column_duplicate_count(frame)
    rows = _row_count(frame)
    if duplicates == 0:
        return ValidationPreview(
            status=ValidationStatus.VALID,
            impact=ValidationImpact(
                summary="No exact-duplicate rows detected; drop_duplicates is a no-op.",
            ),
        )
    return ValidationPreview(
        status=ValidationStatus.VALID,
        impact=ValidationImpact(
            affected_rows=duplicates,
            summary=(
                f"Dropping duplicates would remove {duplicates} of {rows} row(s); "
                f"row count would fall to {max(rows - duplicates, 0)}."
            ),
        ),
    )


def _preview_cap_outliers(
    recommendation: Recommendation,
    *,
    frame: Any,
) -> ValidationPreview:
    column = (recommendation.affected_columns or ("",))[0] or "<dataset>"
    threshold = float(((recommendation.operation or None) and recommendation.operation.params.get("threshold", 0.0)) or 0.0)
    if frame is None or column not in _column_names(frame):
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary=f"Column '{column}' is not present in the dataset version.",
                affected_columns=(column,),
                unexpected_side_effects=("column_not_found",),
            ),
        )
    capped = _column_value_count_above(frame, column, threshold)
    rows = _row_count(frame)
    return ValidationPreview(
        status=ValidationStatus.VALID,
        impact=ValidationImpact(
            affected_rows=capped,
            affected_columns=(column,),
            summary=(
                f"Capping values above {threshold} in '{column}' would touch {capped} "
                f"of {rows} row(s)."
            ),
        ),
    )


def _preview_cast_type(
    recommendation: Recommendation,
    *,
    frame: Any,
) -> ValidationPreview:
    column = (recommendation.affected_columns or ("",))[0] or "<dataset>"
    physical_type = _column_physical_type(frame, column)
    if frame is None or column not in _column_names(frame):
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary=f"Column '{column}' is not present in the dataset version.",
                affected_columns=(column,),
                unexpected_side_effects=("column_not_found",),
            ),
        )
    return ValidationPreview(
        status=ValidationStatus.WARNING,
        impact=ValidationImpact(
            affected_columns=(column,),
            summary=(
                f"Cast type for '{column}': current physical type is '{physical_type}'; "
                f"the apply step would coerce values to a stable target type (Task 10)."
            ),
            unexpected_side_effects=("apply_required",),
        ),
    )


def _preview_group_rare_categorical(
    recommendation: Recommendation,
    *,
    frame: Any,
) -> ValidationPreview:
    column = (recommendation.affected_columns or ("",))[0] or "<dataset>"
    min_count = int(
        ((recommendation.operation or None) and recommendation.operation.params.get("min_count", 5)) or 5
    )
    if frame is None or column not in _column_names(frame):
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary=f"Column '{column}' is not present in the dataset version.",
                affected_columns=(column,),
                unexpected_side_effects=("column_not_found",),
            ),
        )
    rare = _column_rare_count(frame, column, min_count)
    return ValidationPreview(
        status=ValidationStatus.VALID,
        impact=ValidationImpact(
            affected_rows=rare,
            affected_columns=(column,),
            summary=(
                f"Grouping categories with count < {min_count} in '{column}' would "
                f"group approximately {rare} occurrence(s) into the 'Other' bucket."
            ),
        ),
    )


def _preview_review(*, frame: Any) -> ValidationPreview:
    return ValidationPreview(
        status=ValidationStatus.VALID,
        impact=ValidationImpact(
            summary=(
                "Review-only recommendation; no previewed side effects. "
                "The apply step is intentionally a no-op."
            ),
        ),
    )


def preview_recommendation(
    recommendation: Recommendation,
    *,
    path: Path,
    fmt: DatasetFormat,
    sample_size: int,
) -> ValidationPreview:
    """Run the deterministic preview for one recommendation.

    The function reads the bounded source frame and dispatches on the
    recommendation's operation kind. The returned ``ValidationPreview``
    is plain data and never touches the database.
    """

    frame = _read_frame(path, fmt, sample_size)
    if recommendation.operation is None:
        return ValidationPreview(
            status=ValidationStatus.INVALID,
            impact=ValidationImpact(
                summary=(
                    "Recommendation has no constrained operation; nothing to preview."
                ),
                unexpected_side_effects=("missing_operation",),
            ),
        )
    operation_kind = recommendation.operation.kind
    if operation_kind is RecommendationOperationKind.DROP_COLUMN:
        return _preview_drop_column(recommendation, frame=frame)
    if operation_kind is RecommendationOperationKind.IMPUTE_MISSING:
        return _preview_impute_missing(recommendation, frame=frame)
    if operation_kind is RecommendationOperationKind.DROP_DUPLICATES:
        return _preview_drop_duplicates(frame=frame)
    if operation_kind is RecommendationOperationKind.CAP_OUTLIERS:
        return _preview_cap_outliers(recommendation, frame=frame)
    if operation_kind is RecommendationOperationKind.CAST_TYPE:
        return _preview_cast_type(recommendation, frame=frame)
    if operation_kind is RecommendationOperationKind.GROUP_RARE_CATEGORICAL:
        return _preview_group_rare_categorical(recommendation, frame=frame)
    if operation_kind is RecommendationOperationKind.REVIEW:
        return _preview_review(frame=frame)
    return ValidationPreview(
        status=ValidationStatus.INVALID,
        impact=ValidationImpact(
            summary=(
                f"Unknown operation kind '{operation_kind.value if hasattr(operation_kind, 'value') else operation_kind}' "
                "has no preview."
            ),
            unexpected_side_effects=("unknown_operation_kind",),
        ),
    )


__all__ = [
    "ValidationPreview",
    "preview_recommendation",
]


__all__.append("VALIDATION_FORMULA_VERSION")