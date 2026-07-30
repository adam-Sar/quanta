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


def _write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(_to_csv(rows), encoding="utf-8")


def _to_csv(rows: list[dict[str, object]]) -> str:
    if not rows:
        return ""
    fieldnames = list(rows[0].keys())
    lines = [",".join(fieldnames)]
    for row in rows:
        cells: list[str] = []
        for field in fieldnames:
            value = row.get(field)
            if value is None:
                cells.append("")
            else:
                cells.append(str(value))
        lines.append(",".join(cells))
    return "\n".join(lines) + "\n"


def _write_parquet(path: Path, frame: pl.DataFrame) -> None:
    frame.write_parquet(path)


def _profiler(sample_size: int = 10_000) -> DatasetProfiler:
    return DatasetProfiler(
        sample_size=sample_size,
        csv_infer_length=10_000,
        top_values_limit=5,
    )


def test_csv_profile_full_dataset_reports_per_column_metrics(tmp_path: Path) -> None:
    rows = [
        {"id": 1, "name": "alice", "score": 1.5, "joined": "2025-01-01"},
        {"id": 2, "name": "bob", "score": 2.0, "joined": "2025-01-02"},
        {"id": 3, "name": None, "score": None, "joined": "2025-01-03"},
    ]
    csv_path = tmp_path / "people.csv"
    _write_csv(csv_path, rows)

    result = _profiler().profile(DatasetFormat.CSV, csv_path)

    assert result.dataset_id is not None
    assert result.dataset_version_id is not None
    assert result.sample_size == 3
    assert result.sampled is ColumnSamplingFlag.FULL
    assert {column.name for column in result.columns} == {"id", "name", "score", "joined"}
    ordinals = [column.ordinal_position for column in result.columns]
    assert ordinals == [1, 2, 3, 4]

    by_name = {column.name: column for column in result.columns}

    name_column = by_name["name"]
    assert name_column.null_count == 1
    assert name_column.non_null_count == 2
    assert name_column.null_rate == pytest.approx(1 / 3)
    assert name_column.distinct_count == 2
    assert name_column.top_values == (
        ValueFrequency(value="alice", count=1, frequency=0.5),
        ValueFrequency(value="bob", count=1, frequency=0.5),
    )
    assert name_column.string_length.min_length == 3
    assert name_column.string_length.max_length == 5
    assert name_column.string_length.mean_length == pytest.approx(4.0)

    score_column = by_name["score"]
    assert score_column.null_count == 1
    assert score_column.distinct_count == 2
    assert score_column.numeric.min_value == pytest.approx(1.5)
    assert score_column.numeric.max_value == pytest.approx(2.0)
    assert score_column.numeric.mean_value == pytest.approx(1.75)
    assert score_column.numeric.sum_value == pytest.approx(3.5)

    joined_column = by_name["joined"]
    assert joined_column.temporal.min_value == "2025-01-01T00:00:00+00:00"
    assert joined_column.temporal.max_value == "2025-01-03T00:00:00+00:00"


def test_csv_profile_flags_sampling_when_exceeds_sample_size(tmp_path: Path) -> None:
    rows = [{"id": index, "value": index * 2} for index in range(20)]
    csv_path = tmp_path / "many.csv"
    _write_csv(csv_path, rows)

    result = _profiler(sample_size=5).profile(DatasetFormat.CSV, csv_path)

    assert result.sample_size == 5
    assert result.sampled is ColumnSamplingFlag.SAMPLED
    id_column = next(column for column in result.columns if column.name == "id")
    assert id_column.sample_size == 5
    assert id_column.non_null_count == 5
    assert id_column.distinct_count == 5


def test_parquet_profile_preserves_typed_metrics(tmp_path: Path) -> None:
    frame = pl.DataFrame(
        {
            "id": pl.Series(values=[10, 20, 30, 40, None], dtype=pl.Int64),
            "city": pl.Series(values=["beirut", "paris", "beirut", None, "london"]),
            "ratio": pl.Series(values=[0.1, 0.2, 0.3, 0.4, 0.5], dtype=pl.Float64),
        }
    )
    parquet_path = tmp_path / "people.parquet"
    _write_parquet(parquet_path, frame)

    result = _profiler().profile(DatasetFormat.PARQUET, parquet_path)

    assert result.sample_size == 5
    assert result.sampled is ColumnSamplingFlag.FULL
    by_name = {column.name: column for column in result.columns}
    city = by_name["city"]
    assert city.null_count == 1
    assert city.distinct_count == 3
    assert city.top_values[0].value == "beirut"
    assert city.top_values[0].count == 2

    ratio = by_name["ratio"]
    assert ratio.numeric.min_value == pytest.approx(0.1)
    assert ratio.numeric.max_value == pytest.approx(0.5)
    assert ratio.numeric.mean_value == pytest.approx(0.3)


def test_top_values_are_sorted_by_count_then_value(tmp_path: Path) -> None:
    rows = [
        {"flag": "a"},
        {"flag": "a"},
        {"flag": "a"},
        {"flag": "b"},
        {"flag": "b"},
        {"flag": "c"},
        {"flag": None},
    ]
    csv_path = tmp_path / "flags.csv"
    _write_csv(csv_path, rows)

    result = _profiler().profile(DatasetFormat.CSV, csv_path)
    flag_column = next(column for column in result.columns if column.name == "flag")
    values = [(item.value, item.count) for item in flag_column.top_values]
    assert values == [("a", 3), ("b", 2), ("c", 1)]


def test_column_metrics_dict_is_json_serialisable(tmp_path: Path) -> None:
    rows = [
        {"id": 1, "name": "alice"},
        {"id": 2, "name": None},
    ]
    csv_path = tmp_path / "two.csv"
    _write_csv(csv_path, rows)

    result = _profiler().profile(DatasetFormat.CSV, csv_path)
    payloads = to_column_metrics_dicts(result.columns)
    encoded = json.dumps(payloads)
    decoded = json.loads(encoded)
    assert isinstance(decoded, list)
    by_name = {entry["name"]: entry for entry in decoded}
    assert by_name["name"]["null_count"] == 1
    assert by_name["name"]["numeric"]["min"] is None
    assert isinstance(by_name["name"]["top_values"], list)


def test_invalid_file_raises_invalid_dataset_file(tmp_path: Path) -> None:
    bad_path = tmp_path / "broken.csv"
    bad_path.write_text("not,a,real\ncsv\"\"broken", encoding="utf-8")

    profiler = _profiler()
    with pytest.raises(InvalidDatasetFileError):
        profiler.profile(DatasetFormat.CSV, bad_path)