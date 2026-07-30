"""Streaming column metric aggregation.

This module produces deterministic, task-3-only statistics:

* null counts / rates
* distinct counts / rates
* numeric min / max / mean / median / stddev / sum
* temporal min / max (string-ISO formatted)
* string length min / max / mean
* top values (sorted by count desc, then by string asc)
* flagged sampling: "sampled" if the row count of the underlying frame
  exceeds the configured sample size, otherwise "full".

Algorithms are deliberately simple, deterministic, and documented. DuckDB
is not used. No distribution fitting, no ML, no skew/kurtosis in Task 3.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import UUID

import polars as pl

from app.ingestion.exceptions import InvalidDatasetFileError
from app.ingestion.readers.base import DatasetMetadataReader
from app.ingestion.types import DatasetFormat
from app.profiling.types import (
    ColumnProfileResult,
    ColumnSamplingFlag,
    DatasetProfileResult,
    NumericColumnStats,
    StringLengthStats,
    TemporalColumnStats,
    ValueFrequency,
)


def _rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator) / float(denominator)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _jsonable(value: Any) -> Any:
    """Coerce values for JSONB storage. Pandas/Polars sentinels become None."""

    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, datetime):
        return _iso(value)
    if isinstance(value, (str, int, bool)):
        return value
    return str(value)


def _is_numeric(dtype: pl.DataType) -> bool:
    return dtype.is_numeric() or dtype.is_decimal() or dtype.is_integer() or dtype.is_float()


def _is_temporal(dtype: pl.DataType) -> bool:
    return (
        isinstance(dtype, pl.Datetime)
        or dtype == pl.Date
        or dtype == pl.Time
        or isinstance(dtype, pl.Duration)
    )


def _is_string(dtype: pl.DataType) -> bool:
    return dtype == pl.String or dtype == pl.Categorical or dtype == pl.Enum or dtype == pl.Binary


def _stringify(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="replace")
        except Exception:  # pragma: no cover - defensive
            return None
    return str(value)


def _top_values(
    series: pl.Series,
    *,
    limit: int,
) -> tuple[ValueFrequency, ...]:
    """Return up to ``limit`` non-null values, sorted by count desc, value asc."""

    if series.len() == 0:
        return ()
    cleaned = series.drop_nulls()
    if cleaned.len() == 0:
        return ()
    sample_size = cleaned.len()
    frame = cleaned.value_counts()  # returns a DataFrame with [value, count]
    if frame.is_empty():
        return ()
    frame = frame.sort([str(frame.columns[1]), str(frame.columns[0])], descending=[True, False])
    frame = frame.head(limit)
    out: list[ValueFrequency] = []
    for row in frame.iter_rows():
        value = _stringify(row[0])
        if value is None:
            continue
        count = int(row[1])
        out.append(ValueFrequency(value=value, count=count, frequency=_rate(count, sample_size)))
    return tuple(out)


def _numeric_stats(series: pl.Series) -> NumericColumnStats:
    cleaned = series.drop_nulls()
    if cleaned.len() == 0:
        return NumericColumnStats()
    try:
        min_value = float(cast("float | int", cleaned.min()))
        max_value = float(cast("float | int", cleaned.max()))
        mean_value = float(cast("float | int", cleaned.mean()))
        median_value = float(cast("float | int", cleaned.median()))
        std_raw = cast("float | None", cleaned.std())
        std_deviation = float(std_raw) if cleaned.len() > 1 and std_raw is not None else 0.0
        sum_value = float(cast("float | int", cleaned.sum()))
    except Exception:  # pragma: no cover - defensive
        return NumericColumnStats()
    return NumericColumnStats(
        min_value=min_value,
        max_value=max_value,
        mean_value=mean_value,
        median_value=median_value,
        std_deviation=std_deviation,
        sum_value=sum_value,
    )


def _temporal_stats(series: pl.Series) -> TemporalColumnStats:
    cleaned = series.drop_nulls()
    if cleaned.len() == 0:
        return TemporalColumnStats()
    try:
        min_raw = cast("datetime | None", cleaned.min())
        max_raw = cast("datetime | None", cleaned.max())
        min_value = _iso(min_raw)
        max_value = _iso(max_raw)
    except Exception:  # pragma: no cover - defensive
        return TemporalColumnStats()
    return TemporalColumnStats(min_value=min_value, max_value=max_value)


def _string_stats(series: pl.Series) -> StringLengthStats:
    cleaned = series.drop_nulls()
    if cleaned.len() == 0:
        return StringLengthStats()
    try:
        casted = cleaned.cast(pl.String, strict=False)
        if casted.is_empty():
            return StringLengthStats()
        lengths = casted.str.len_chars()
        if lengths.is_empty():
            return StringLengthStats()
        return StringLengthStats(
            min_length=int(cast("int | float", lengths.min())),
            max_length=int(cast("int | float", lengths.max())),
            mean_length=float(cast("int | float", lengths.mean())),
        )
    except Exception:  # pragma: no cover - defensive
        return StringLengthStats()


def _column_metrics(
    series: pl.Series,
    ordinal_position: int,
    *,
    top_values_limit: int,
) -> ColumnProfileResult:
    physical_type = str(series.dtype)
    name = series.name
    total = series.len()
    null_count = int(series.null_count())
    non_null_count = total - null_count
    distinct_source = series.drop_nulls()
    distinct = int(distinct_source.n_unique()) if distinct_source.len() > 0 else 0
    return ColumnProfileResult(
        name=name,
        ordinal_position=ordinal_position,
        physical_type=physical_type,
        non_null_count=non_null_count,
        null_count=null_count,
        null_rate=_rate(null_count, total),
        distinct_count=distinct,
        distinct_rate=_rate(distinct, non_null_count if non_null_count else 0),
        sample_size=total,
        top_values=_top_values(series, limit=top_values_limit),
        numeric=_numeric_stats(series),
        temporal=_temporal_stats(series),
        string_length=_string_stats(series),
    )


def _result_to_metrics(result: ColumnProfileResult) -> dict[str, Any]:
    """Flatten a column result into a JSONB-safe dict for storage."""

    return {
        "physical_type": result.physical_type,
        "sample_size": result.sample_size,
        "non_null_count": result.non_null_count,
        "null_count": result.null_count,
        "null_rate": _jsonable(result.null_rate),
        "distinct_count": result.distinct_count,
        "distinct_rate": _jsonable(result.distinct_rate),
        "top_values": [
            {"value": tv.value, "count": tv.count, "frequency": _jsonable(tv.frequency)}
            for tv in result.top_values
        ],
        "numeric": {
            "min": _jsonable(result.numeric.min_value),
            "max": _jsonable(result.numeric.max_value),
            "mean": _jsonable(result.numeric.mean_value),
            "median": _jsonable(result.numeric.median_value),
            "std": _jsonable(result.numeric.std_deviation),
            "sum": _jsonable(result.numeric.sum_value),
        },
        "temporal": {
            "min": result.temporal.min_value,
            "max": result.temporal.max_value,
        },
        "string_length": {
            "min": result.string_length.min_length,
            "max": result.string_length.max_length,
            "mean": _jsonable(result.string_length.mean_length),
        },
    }


class _PolarsFrameBuilder:
    """Read the original via Polars (CSV) or PyArrow (Parquet) and
    produce an in-memory ``pl.DataFrame`` bounded by ``sample_size`` rows.
    """

    def __init__(self, sample_size: int, csv_infer_length: int) -> None:
        self.sample_size = sample_size
        self.csv_infer_length = csv_infer_length

    def build(
        self,
        dataset_format: DatasetFormat,
        path: Path,
    ) -> tuple[pl.DataFrame, int, ColumnSamplingFlag]:
        try:
            if dataset_format == DatasetFormat.CSV:
                frame = pl.read_csv(
                    path,
                    infer_schema_length=self.csv_infer_length,
                    try_parse_dates=True,
                )
            elif dataset_format == DatasetFormat.PARQUET:
                frame = pl.read_parquet(path)
            else:
                raise InvalidDatasetFileError("unsupported_format")
        except (OSError, UnicodeError, pl.exceptions.PolarsError, ValueError) as exc:
            raise InvalidDatasetFileError("profile_read_failed") from exc
        total = frame.height
        if total > self.sample_size:
            sampled = frame.head(self.sample_size)
            return sampled, total, ColumnSamplingFlag.SAMPLED
        return frame, total, ColumnSamplingFlag.FULL


class DatasetProfiler(DatasetMetadataReader):
    """Top-level entry point used by the ProfilingService.

    Implements the same ``DatasetMetadataReader`` contract as the
    ingestion readers, but returns a richer ``DatasetProfileResult``.
    """

    def __init__(self, sample_size: int, csv_infer_length: int, top_values_limit: int) -> None:
        self.sample_size = sample_size
        self.csv_infer_length = csv_infer_length
        self.top_values_limit = top_values_limit

    def read_metadata(self, path: Path) -> DatasetProfileResult:  # type: ignore[override]
        raise NotImplementedError("Use profile() with the dataset format.")

    def profile(
        self,
        dataset_format: DatasetFormat,
        path: Path,
        *,
        dataset_id: UUID | None = None,
        dataset_version_id: UUID | None = None,
    ) -> DatasetProfileResult:
        from uuid import uuid4

        if dataset_id is None:
            dataset_id = uuid4()
        if dataset_version_id is None:
            dataset_version_id = uuid4()

        import time

        started = time.perf_counter()
        started_at = datetime.now(UTC)
        builder = _PolarsFrameBuilder(
            sample_size=self.sample_size,
            csv_infer_length=self.csv_infer_length,
        )
        frame, _total, sampled = builder.build(dataset_format, path)
        sample_size = frame.height
        columns: list[ColumnProfileResult] = []
        for ordinal, name in enumerate(frame.columns, start=1):
            series = frame.get_column(name)
            columns.append(_column_metrics(series, ordinal, top_values_limit=self.top_values_limit))
        completed_at = datetime.now(UTC)
        duration_ms = int((time.perf_counter() - started) * 1000)
        return DatasetProfileResult(
            dataset_id=dataset_id,
            dataset_version_id=dataset_version_id,
            sample_size=sample_size,
            sampled=sampled,
            started_at=_iso(started_at) or "",
            completed_at=_iso(completed_at) or "",
            duration_ms=duration_ms,
            columns=tuple(columns),
        )


def to_column_metrics_dicts(
    columns: tuple[ColumnProfileResult, ...],
) -> list[dict[str, Any]]:
    """Map a tuple of column profile results to JSONB-safe dicts."""

    return [
        {
            "name": column.name,
            "ordinal_position": column.ordinal_position,
            "metrics": _result_to_metrics(column),
        }
        for column in columns
    ]
