# Quality scoring

## Status

Quality scoring is implemented in **Task 5** as a deterministic,
explainable aggregation over the immutable Task 4 finding rows. It
produces a single 0–100 score per dataset version plus a letter grade
and a decomposable breakdown by detector kind, severity band, and
column. Two confidence concepts (`detection_confidence` and
`data_error_confidence`) are persisted per finding so the AI layer
(Task 7) and the UI can reason about the score without re-reading the
detector configuration.

## Scope and out of scope

Scoring is intentionally narrow:

- It reads Task 4 finding rows. It does not re-profile data, recompute
  statistics, or invoke any LLM.
- It writes one new immutable `quality_scores` row per run. Existing
  rows are never mutated.
- It does not produce recommendations, transformations, or trend
  signals. Those belong to Task 8 (recommendations), Task 9
  (validation), and Task 6 (history/drift).

## Formula

The current formula version is `task5-1.0`, exposed on every
`quality_scores` row as `formula_version` and persisted on every
`QualityScoreResponse`.

For every Task 4 finding, scoring computes two confidence values and a
penalty contribution:

```
detection_confidence = clamp((value - threshold) / max(threshold, eps), 0, 1)
data_error_confidence = kind-specific heuristic in [0, 1]
severity_weight      = SEVERITY_WEIGHTS[finding.severity]
penalty              = severity_weight * detection_confidence * data_error_confidence
```

The aggregated score is:

```
total_penalty      = sum(penalties)
divisor            = max(column_count, 1)
normalized_penalty = min(1.0, total_penalty / divisor)
score              = round(100 * (1 - normalized_penalty), 2)
grade              = first GRADE_THRESHOLDS whose lower bound is <= score
```

When a profile produced no findings, the score is `100.0` and the grade
is `A`.

### Severity weights

| Severity | Weight |
|---|---|
| `critical` | 1.00 |
| `high`     | 0.75 |
| `medium`   | 0.45 |
| `low`      | 0.20 |
| `info`     | 0.05 |

### Grade thresholds

| Lower bound | Grade |
|---|---|
| 90.0 | A |
| 75.0 | B |
| 60.0 | C |
| 40.0 | D |
|  0.0 | F |

A score of exactly `90.0` is grade `A`. A score of exactly `40.0` is
grade `D`.

### Two confidence concepts

`detection_confidence` answers "how strong is the statistical signal?"
It grows as the observed value moves further past the configured
detector threshold and saturates at 1.0 when the value reaches twice the
threshold. A zero threshold is clamped to a small epsilon so the curve
remains defined for the few detectors that emit a zero threshold.

`data_error_confidence` answers "how likely is this actually a real
error?" It is a per-kind heuristic that stays in `[0, 1]` and never
exceeds 1.0. The current heuristics are:

| Kind | Formula |
|---|---|
| `missingness` | `clamp(0.55 + 0.45 * value)` — more nulls, more certain it's an error |
| `invalid_values` | `clamp(0.75 + 0.25 * clamp(value / 5))` — sentinels are strong evidence |
| `outlier` | `clamp(0.50 + 0.30 * clamp(value))` — outliers may be legitimate |
| `duplicates` | `clamp(0.50 + 0.25 * clamp(value))` — duplicates may be intentional |
| `cardinality` | `clamp(0.40 + 0.20 * clamp(value))` — informational |

A later task may replace the heuristics with evidence-backed ratios
(for example `null_count / non_null_count`); the formula version will
bump when the heuristics change in a non-backward-compatible way.

### Normalization

The penalty is normalized against the number of columns in the dataset
version (`column_count`, defaulting to at least 1). This avoids two
failure modes:

- Adding many clean columns cannot dilute a critical anomaly's
  contribution (the divisor grows, but so does the threshold of what
  is "acceptable").
- A single-column dataset is not unfairly punished for the absence of
  other columns that could have absorbed part of the penalty.

### Decomposition

Every persisted `quality_scores` row carries a `components` JSONB
object with the following shape (illustrative):

```json
{
  "by_kind": {
    "missingness": {
      "count": 2,
      "penalty_total": 0.6123,
      "penalty_normalized": 0.3062
    }
  },
  "by_severity": {
    "medium": {
      "count": 2,
      "penalty_total": 0.6123,
      "penalty_normalized": 0.3062
    }
  },
  "by_column": {
    "email": {
      "count": 1,
      "penalty_total": 0.3061,
      "penalty_normalized": 0.1531
    }
  },
  "overall_penalty_total": 0.6123,
  "overall_penalty_normalized": 0.3062,
  "column_count": 2,
  "per_finding": [
    {
      "kind": "missingness",
      "severity": "medium",
      "column_name": "email",
      "metric": "null_rate",
      "value": 0.62,
      "threshold": 0.5,
      "detection_confidence": 0.24,
      "data_error_confidence": 0.829,
      "penalty": 0.0895
    }
  ]
}
```

The `by_*` buckets always sum to the same overall penalty total, which
matches `overall_penalty_total`. The `per_finding` list carries every
confidence value plus the per-finding penalty so consumers can audit
the score end-to-end.

## Configuration

The score formula is currently hard-coded for stability; the only
operator-tunable knobs are:

| Variable | Default | Purpose |
|---|---|---|
| `SCORE_FORMULA_VERSION` | `task5-1.0` | Persisted on every row; bump when the formula changes |
| `SCORE_NORMALIZATION_DIVISOR_FLOOR` | `1` | Reserved floor for the divisor (always at least 1) |
| `SCORE_MAX_COLUMNS_FOR_NORMALIZATION` | `10000` | Reserved upper bound; not yet enforced |

These knobs are surfaced in `Settings` and `.env.example`. Changing
`SCORE_FORMULA_VERSION` is informational until a future task uses it
to validate persisted rows against the active code path.

## Lifecycle

1. `POST /datasets/{dataset_id}/detections` (Task 4) writes a fresh
   batch of immutable `findings` rows bound to the latest profile.
2. `POST /datasets/{dataset_id}/scores` resolves the latest profile,
   reads its findings, runs the formula, and persists one new
   `quality_scores` row in a single transaction.
3. The original file, profile rows, and finding rows are never mutated;
   a database failure rolls back the insert only.
4. `GET /datasets/{dataset_id}/score`, `GET .../versions/{id}/score`,
   and `GET .../scores` return the persisted score rows without
   recomputing.

## Testing expectations

Unit tests cover the formula directly (`tests/unit/test_scoring_formula.py`)
and exercise the service layer with an in-memory SQLite database
(`tests/unit/test_scoring_service.py`). API tests
(`tests/api/test_scores.py`) drive the routes via the FastAPI test
client and the same SQLite-backed dependency overrides used by Task 3
and Task 4. Future integration tests may extend coverage to a real
PostgreSQL instance, mirroring the Task 3 / Task 4 opt-in pattern.

The tests assert:

- detection / data-error confidence bounds, monotonicity, and clamping
- empty finding batches produce an A with `score == 100.0`
- critical findings on a 1-column dataset drop the score to F
- every `by_*` bucket sums to the overall penalty total
- the per-finding breakdown is persisted and round-trips through JSON
- the score is always bounded to `[0.0, 100.0]`
- re-running scoring produces a new row without mutating prior rows

## Limitations

- The score is purely deterministic and does not learn from prior runs.
  Historical comparison (Task 6) will read multiple score rows to
  compute trends.
- The kind-specific `data_error_confidence` heuristics are intentionally
  conservative. They will be replaced with evidence-backed ratios when
  more context (sample size, completeness, referential integrity) is
  available.
- There is no UI today. The frontend integration is planned for
  Task 10 alongside the durable analysis job resource.