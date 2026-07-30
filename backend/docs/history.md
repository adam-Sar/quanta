# History, drift, and lineage

## Status

Deterministic history comparisons and lineage traversal are
implemented in **Task 6**. The layer reads the immutable Task 2-5
rows for two dataset versions and produces a `DatasetComparison`
object plus a deterministic 0-100 score breakdown, a per-column
distribution drift, and a 0-100 score drift. Comparisons are
persisted as immutable `HistoryComparison` rows. Lineage is
computed on demand by walking the version chain; no separate table
is required.

## Scope and out of scope

History is intentionally narrow:

- It reads the existing Task 2-5 rows. It does not re-profile data
  or invoke any LLM.
- It writes one new immutable `history_comparisons` row per
  comparison run.
- It does not produce trend analysis (Task 6) or aggregation
  recommendations. Those belong to Task 7.
- It does not implement automated alerting; the persisted
  comparison row is the audit trail.

## Formula

For two dataset versions `base` and `target`, the comparison runs
three pure functions over the immutable rows and produces a
`DatasetComparison`:

```text
SchemaDiff        = compare_schema(base.columns, target.columns)
NumericDrift      = compare_numeric(base_profiles, target_profiles)
CategoricalDrift  = compare_categorical(base_profiles, target_profiles)
ScoreDrift        = compare_scores(base_score, target_score)
```

### Numeric drift

For each common column and for each of `mean`, `median`, `std`,
`min`, and `max`, the detector emits a `NumericDrift` with the
absolute and relative change. The relative change uses
`max(|base|, 1.0)` as the divisor so a tiny base value does not
explode the ratio.

```text
absolute_change  = target - base
relative_change  = |target - base| / max(|base|, 1.0)
```

### Categorical drift (PSI)

For each common column, the detector computes the
population-stability index over the union of the top values:

```text
psi = sum_over_keys((p_target - p_base) * ln(p_target / p_base))
```

`p` is the proportion of the value in the column's top-values
distribution. A value of `0` is treated as `eps` so the logarithm
stays finite. The total mass is renormalized to the union so
`psi` lives in `[0, +inf)`.

### Score drift

The Task 5 0-100 score is read back for each version; the
detector reports the absolute delta and whether the letter grade
changed.

### Documented thresholds

The default thresholds are surfaced as `Settings` keys so operators
can tune them per deployment. Bump `HISTORY_FORMULA_VERSION` when
any of these change in a non-backward-compatible way.

| Threshold | Default | Meaning |
|---|---|---|
| `HISTORY_NUMERIC_RELATIVE_CHANGE_MEDIUM` | 0.20 | Numeric drift crosses the "medium" bar at 20% relative change. |
| `HISTORY_NUMERIC_RELATIVE_CHANGE_HIGH`   | 0.50 | Numeric drift crosses the "high" bar at 50%. |
| `HISTORY_CATEGORICAL_PSI_LOW`            | 0.10 | PSI above 0.10 is a soft categorical drift. |
| `HISTORY_CATEGORICAL_PSI_MEDIUM`         | 0.20 | PSI above 0.20 is a hard categorical drift. |
| `HISTORY_SCORE_DELTA_LOW`               | 5.0  | Quality-score change of 5 points. |
| `HISTORY_SCORE_DELTA_MEDIUM`            | 10.0 | Quality-score change of 10 points. |
| `HISTORY_SCORE_DELTA_HIGH`              | 20.0 | Quality-score change of 20 points. |

The current formula version is `task6-1.0`; it is persisted on
every comparison row and surfaced in the API response so consumers
can audit the row against the active code.

## Lineage

`HistoryService.lineage(dataset_id)` returns the ordered
`LineageEdge` objects for a dataset. Edges are derived from
`DatasetVersion.version_number` and `created_at`; they are not
persisted because the underlying rows are already immutable. A
dataset with a single version returns no edges.

## Lifecycle

1. `POST /datasets/{dataset_id}/comparisons` (Task 6) reads the
   two versions' column, profile, column-profile, and quality-score
   rows, runs the deterministic comparison, and persists a fresh
   immutable `HistoryComparison` row in a single transaction.
2. The original files, the profile rows, and the score rows are
   never mutated; a database failure rolls back the insert only.
3. `GET /datasets/{dataset_id}/comparisons/{comparison_id}` and
   `GET /datasets/{dataset_id}/comparisons` return the persisted
   comparison rows without recomputing.
4. `GET /datasets/{dataset_id}/lineage` walks the version chain
   and returns the ordered lineage edges.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `HISTORY_FORMULA_VERSION` | `task6-1.0` | Persisted on every comparison; bump when the formula changes. |
| `HISTORY_NUMERIC_RELATIVE_CHANGE_MEDIUM` | 0.20 | Soft numeric drift bar. |
| `HISTORY_NUMERIC_RELATIVE_CHANGE_HIGH`   | 0.50 | Hard numeric drift bar. |
| `HISTORY_CATEGORICAL_PSI_LOW`            | 0.10 | PSI low band. |
| `HISTORY_CATEGORICAL_PSI_MEDIUM`         | 0.20 | PSI high band. |
| `HISTORY_SCORE_DELTA_LOW`               | 5.0  | Quality-score low band. |
| `HISTORY_SCORE_DELTA_MEDIUM`            | 10.0 | Quality-score medium band. |
| `HISTORY_SCORE_DELTA_HIGH`              | 20.0 | Quality-score high band. |

## Testing expectations

Unit tests cover the deterministic formula directly
(`tests/unit/test_history_comparison.py`,
`tests/unit/test_history_drift.py`,
`tests/unit/test_history_lineage.py`) and exercise the service
layer with an in-memory SQLite database
(`tests/unit/test_history_service.py`). API tests
(`tests/api/test_history.py`) drive the routes via the FastAPI
test client and the same SQLite-backed dependency overrides used by
Task 3, Task 4, and Task 5.

The tests assert:

- added / removed / type-changed columns are detected;
- numeric relative change uses the safe `max(|base|, 1.0)` divisor
  and is bounded to non-negative values;
- PSI is zero for identical distributions, finite when a
  category disappears, and grows above 0.5 for a 50/50 swap;
- score drift returns `None` for missing sides and reports the
  grade change only when both sides are known;
- lineage edges are sorted by `version_number` and the chain is
  empty for zero or one version;
- the immutable history row is persisted with a fresh UUID on
  every run and the original rows are never mutated.

## Limitations

- Numeric drift operates on the persisted profile summary
  (min/max/mean/median/std) and cannot recover distributional
  detail (for example quantiles or histograms). Task 7 may add
  such detail if a real use case requires it.
- PSI is bounded above by the number of distinct categories but
  not above infinity; downstream consumers should treat it as
  "no upper bound" when designing thresholds.
- The formula has no notion of weighted drift: every column
  contributes equally. Task 7 may add per-column or
  per-business-domain weights if required.
- The comparison is always between two specific versions; there
  is no implicit "latest vs previous" mode at the API layer. That
  decision is left to the caller so the audit trail is explicit.
