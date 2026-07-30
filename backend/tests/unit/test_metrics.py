"""Unit tests for the deterministic profiling metrics (Task 3)."""

from __future__ import annotations

import json
from pathlib import Path

import polars as pl
import pytest

from app.ingestion.exceptions import InvalidDatasetFileError
from app.ingestion.types import DatasetFormat
from app.profiling.metrics import (
    DatasetProfiler,
    to_column_metrics_dicts,
)
from app.profiling.types import ColumnSamplingFlag, ValueFrequency


def _profiler(sample_size: int = 10_000) -> DatasetProfiler:
    return DatasetProfiler(
        sample_size=sample_size,
        csv_infer_length=10_000,
        top_values_limit=5,
    )


def test_csv_profile_full_dataset_reports_per_column_metrics(tmp_path: Path) -> None:
    csv_path = tmp_path / "people.csv"
    csv_path.write_text(
        "id,name,score,joined\n"
        "1,alice,1.5,2025-01-01\n"
        "2,bob,2.0,2025-01-02\n"
        "3,carol,3.5,2025-01-03\n",
        encoding="utf-8",
    )

    result = _profiler().profile(DatasetFormat.CSV, csv_path)

    assert result.sample_size == 3
    assert result.sampled is ColumnSamplingFlag.FULL
    assert {column.name for column in result.columns} == {"id", "name", "score", "joined"}
    ordinals = [column.ordinal_position for column in result.columns]
    assert ordinals == [1, 2, 3, 4]

    by_name = {column.name: column for column in result.columns}

    name_column = by_name["name"]
    assert name_column.null_count == 0
    assert name_column.non_null_count == 3
    assert name_column.distinct_count == 3
    assert name_column.top_values == (
        ValueFrequency(value="alice", count=1, frequency=1 / 3),
        ValueFrequency(value="bob", count=1, frequency=1 / 3),
        ValueFrequency(value="carol", count=1, frequency=1 / 3),
    )
    # alice (5) + bob (3) + carol (5) = 13 / 3 = 4.333...
    assert name_column.string_length.min_length == 3
    assert name_column.string_length.max_length == 5
    assert name_column.string_length.mean_length == pytest.approx(13 / 3)

    score_column = by_name["score"]
    assert score_column.null_count == 0
    assert score_column.distinct_count == 3
    assert score_column.numeric.min_value == pytest.approx(1.5)
    assert score_column.numeric.max_value == pytest.approx(3.5)
    assert score_column.numeric.mean_value == pytest.approx(7 / 3)
    assert score_column.numeric.sum_value == pytest.approx(7.0)


def test_csv_profile_handles_nulls_and_sampling_flag(tmp_path: Path) -> None:
    csv_path = tmp_path / "people.csv"
    csv_path.write_text(
        "id,name\n1,alice\n2,bob\n3,\n",
        encoding="utf-8",
    )

    result = _profiler().profile(DatasetFormat.CSV, csv_path)

    assert result.sample_size == 3
    by_name = {column.name: column for column in result.columns}
    name_column = by_name["name"]
    assert name_column.null_count == 1
    assert name_column.non_null_count == 2
    assert name_column.null_rate == pytest.approx(1 / 3)
    assert name_column.top_values == (
        ValueFrequency(value="alice", count=1, frequency=0.5),
        ValueFrequency(value="bob", count=1, frequency=0.5),
    )


def test_csv_profile_flags_sampling_when_exceeds_sample_size(tmp_path: Path) -> None:
    csv_path = tmp_path / "many.csv"
    csv_path.write_text("id\n" + "\n".join(str(i) for i in range(20)) + "\n", encoding="utf-8")

    result = _profiler(sample_size=5).profile(DatasetFormat.CSV, csv_path)

    assert result.sample_size == 5
    assert result.sampled is ColumnSamplingFlag.SAMPLED
    id_column = next(column for column in result.columns if column.name == "id")
    assert id_column.sample_size == 5
    assert id_column.non_null_count == 5


def test_parquet_profile_preserves_typed_metrics(tmp_path: Path) -> None:
    frame = pl.DataFrame(
        {
            "id": pl.Series(values=[10, 20, 30, 40, None], dtype=pl.Int64),
            "city": pl.Series(values=["beirut", "paris", "beirut", None, "london"]),
            "ratio": pl.Series(values=[0.1, 0.2, 0.3, 0.4, 0.5], dtype=pl.Float64),
        }
    )
    parquet_path = tmp_path / "people.parquet"
    frame.write_parquet(parquet_path)

    result = _profiler().profile(DatasetFormat.PARQUET, parquet_path)

    assert result.sample_size == 5
    assert result.sampled is ColumnSamplingFlag.FULL
    by_name = {column.name: column for column in result.columns}
    city = by_name["city"]
    assert city.null_count == 1
    assert city.distinct_count == 3  # non-null distinct: beirut, paris, london
    assert city.top_values[0].value == "beirut"
    assert city.top_values[0].count == 2

    ratio = by_name["ratio"]
    assert ratio.numeric.min_value == pytest.approx(0.1)
    assert ratio.numeric.max_value == pytest.approx(0.5)
    assert ratio.numeric.mean_value == pytest.approx(0.3)


def test_top_values_are_sorted_by_count_then_value(tmp_path: Path) -> None:
    csv_path = tmp_path / "flags.csv"
    csv_path.write_text(
        "flag\n" + "a\n" * 3 + "b\n" * 2 + "c\n",
        encoding="utf-8",
    )

    result = _profiler().profile(DatasetFormat.CSV, csv_path)
    flag_column = next(column for column in result.columns if column.name == "flag")
    values = [(item.value, item.count) for item in flag_column.top_values]
    assert values == [("a", 3), ("b", 2), ("c", 1)]


def test_column_metrics_dict_is_json_serialisable(tmp_path: Path) -> None:
    csv_path = tmp_path / "two.csv"
    csv_path.write_text("id,name\n1,alice\n2,bob\n", encoding="utf-8")

    result = _profiler().profile(DatasetFormat.CSV, csv_path)
    payloads = to_column_metrics_dicts(result.columns)
    encoded = json.dumps(payloads)
    decoded = json.loads(encoded)
    assert isinstance(decoded, list)
    by_name = {entry["name"]: entry for entry in decoded}
    name_payload = by_name["name"]["metrics"]
    assert "null_count" in name_payload
    assert name_payload["null_count"] == 0
    assert name_payload["null_rate"] == 0.0
    assert "distinct_count" in name_payload
    assert name_payload["distinct_count"] == 2
    assert "numeric" in name_payload
    # String columns have no numeric stats, so numeric.min is None.
    assert name_payload["numeric"]["min"] is None
    assert "top_values" in name_payload
    top_values = name_payload["top_values"]
    assert {item["value"] for item in top_values} == {"alice", "bob"}


def test_invalid_file_raises_invalid_dataset_file(tmp_path: Path) -> None:
    missing_path = tmp_path / "missing.csv"

    profiler = _profiler()
    with pytest.raises(InvalidDatasetFileError):
        profiler.profile(DatasetFormat.CSV, missing_path)
