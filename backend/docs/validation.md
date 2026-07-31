# Validation layer (Task 9)

## Status

Task 9 is **implemented** as a deterministic, **preview-only** validation
engine. The layer consumes a Task 8 `Recommendation` row, reads the
matching dataset version's source file through `FileStorage.path_for`
and `polars.scan_csv` / `pyarrow`, and returns a structured
`ValidationImpact` summary. The engine never mutates the source file;
the `impact` field is a projected summary, not an applied effect.

The actual apply call, which would create a new immutable dataset
version, is **explicitly out of scope** and lands in a later task
(Task 10 durable analysis jobs).

## Inputs

The service reads the following persisted artifacts for a single
recommendation:

* The `Recommendation` row (Task 8).
* The matching `DatasetVersion` (latest by `version_number`).
* The source file referenced by `DatasetVersion.storage_key`
  (`FileStorage.path_for`).
* The latest `DatasetProfile` (used to anchor the validation row).

## Status and impact

Every validation has a deterministic `status`:

* `valid` — the previewed operation is applicable and produces a
  documented impact.
* `warning` — the operation is applicable but has caveats (for
  example, `cast_type` needs the apply step).
* `invalid` — the operation is not applicable (column not found,
  source file unreadable, missing dataset version, etc.).

`impact` is a JSONB payload with:

* `affected_rows` — estimated count of rows that would change.
* `affected_columns` — list of column names.
* `summary` — human-readable summary of the projected effect.
* `unexpected_side_effects` — list of deterministic risk codes
  (for example, `column_not_found`, `source_unreadable`,
  `apply_required`).

## Per-operation behaviour

| Operation | Preview |
|---|---|
| `impute_missing(column, strategy)` | Counts nulls in the bounded source frame. Status `valid` if the column exists. |
| `drop_column(column)` | Lists the columns that would remain. Status `valid` if the column exists. |
| `drop_duplicates` | Counts exact-duplicate rows. Status `valid` if the source is readable. |
| `cap_outliers(column, threshold)` | Counts values above the threshold. Status `valid` if the column exists. |
| `cast_type(column)` | Returns the source physical type; status `warning` with `apply_required` risk. |
| `group_rare_categorical(column, min_count)` | Counts occurrences of categories with count < min_count. Status `valid` if the column exists. |
| `review` | Always `valid`, no projected impact. |

The engine is intentionally bounded by
`profile_default_sample_rows` (shared with the Task 3 profiler) so
a pathological dataset cannot exhaust the API worker's memory.

## Persistence

Each run produces a fresh immutable `Validation` row carrying:

* `dataset_id`, `dataset_version_id`, `profile_id`,
  `recommendation_id` (FKs to the persisted Task 2-8 rows)
* `operation_kind`, `status`, `title`, `rationale`
* `impact` JSONB (per-operation summary)
* `components` JSONB (source pointers for audit)
* `formula_version` (`task9-1.0`)

The new `0009_create_validations` migration adds the `validations`
table with FKs to `datasets`, `dataset_versions`, `dataset_profiles`,
and `recommendations` (all `ON DELETE CASCADE`) plus four indexes
(dataset/created, recommendation, status, formula).

## Safety path

```text
ValidationService.validate_recommendation
  -> load recommendation and latest dataset version
  -> resolve source path via FileStorage.path_for
  -> preview_recommendation (pure rule engine)
  -> persist Validation row (single transaction)
```

No recommendation can ever cause the source file to be mutated; the
preview engine only reads, never writes. A database failure rolls
back the insert only.

## Limitations

* The preview engine does not apply the operation; the actual
  `apply` call (which creates a new immutable dataset version) lands
  in a later task.
* The preview uses the same bounded Polars/PyArrow read as the Task
  3 profiler; very large datasets are bounded by
  `profile_default_sample_rows`.
* The validation service does not re-validate the source file's
  data correctness; it only checks that the previewed operation is
  applicable. Data-quality checks remain the responsibility of the
  Task 4 detectors.
* `cast_type` projections are heuristic; the actual type coercion
  is documented as a Task 10 responsibility (`apply_required` risk).
