# Data model

## Task 10 state

`0001_foundation` establishes a concrete Alembic head. `0002_dataset_ingestion` creates the durable tables for logical datasets and their immutable versions. `0003_create_dataset_profiles` adds immutable profile artifacts. `0004_create_dataset_findings` adds immutable quality findings bound to the latest profile. `0005_create_dataset_quality_scores` adds immutable quality scoring rows. `0006_create_history_comparisons` adds immutable history comparison rows. `0007_create_ai_interpretations` adds immutable AI interpretation rows. `0008_create_recommendations` adds immutable recommendation rows (one row per structured, preview-only recommendation) with a documented `formula_version` (`task8-1.0`) and two JSONB payload columns (`operation_params`, `components`). `0009_create_validations` adds immutable validation rows (one row per deterministic recommendation preview) with a documented `formula_version` (`task9-1.0`) and two JSONB payload columns (`impact`, `components`). `0010_create_jobs` adds the durable analysis jobs table with three JSONB payload columns (`parameters`, `result`, `error`) and a documented `formula_version` (`task10-1.0`). Worker infrastructure (Task 11) does not exist yet.

### `datasets`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `name` | VARCHAR(255) NOT NULL | Trimmed non-blank logical dataset name. |
| `description` | TEXT NULL | Optional description. NULL when blank after trimming. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Updated on column-level updates. |

Indexes: `ix_datasets_created_at`.

### `dataset_versions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | `uq_dataset_versions_number` per dataset. |
| `version_number` | INT NOT NULL | Sequential per dataset starting at 1. |
| `format` | enum `dataset_format` | `csv` or `parquet`. |
| `status` | enum `dataset_version_status` | `stored` (only value in Task 2). |
| `original_filename` | VARCHAR(512) NOT NULL | Sanitized upload basename. |
| `media_type` | VARCHAR(255) NULL | Stated MIME type if provided. |
| `storage_key` | VARCHAR(512) NOT NULL UNIQUE | Generated relative path under `STORAGE_PATH`. |
| `content_sha256` | CHAR(64) NOT NULL | Hex digest of the original file. |
| `size_bytes` | BIGINT NOT NULL | Final on-disk size. |
| `row_count` | BIGINT NOT NULL | Rows reported by the metadata reader. |
| `column_count` | INT NOT NULL | Columns reported by the metadata reader. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Indexes: `uq_dataset_versions_storage_key`, `ix_dataset_versions_content_sha256`, `ix_dataset_versions_dataset_created`.

### `dataset_columns`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_version_id` | UUID NOT NULL FK → `dataset_versions.id` ON DELETE CASCADE | Unique per `(name)` and per `(ordinal_position)`. |
| `name` | VARCHAR(255) NOT NULL | Column name from the source file. |
| `ordinal_position` | INT NOT NULL | 1-based position. |
| `physical_type` | VARCHAR(128) NOT NULL | Library-reported physical type. |
| `logical_type` | enum `logical_data_type` | `boolean`, `integer`, `float`, `decimal`, `string`, `date`, `datetime`, `time`, `duration`, `binary`, `list`, `struct`, `unknown`. |
| `nullable` | BOOLEAN NULL | Parquet nullable flag; CSV reports NULL. |

Indexes: `uq_dataset_columns_name`, `uq_dataset_columns_ordinal`, `ix_dataset_columns_version`.

### `dataset_profiles` (Task 3)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | Profile scope. |
| `dataset_version_id` | UUID NOT NULL FK → `dataset_versions.id` ON DELETE CASCADE | Profiled version. |
| `sample_size` | BIGINT NOT NULL | Rows actually considered (post-sample). |
| `sampled` | enum `column_sampling_flag` | `full` or `sampled`. |
| `started_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Run start. |
| `completed_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Run completion. |
| `duration_ms` | INT NOT NULL | Wall-clock milliseconds. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Insertion timestamp. |

Indexes: `ix_dataset_profiles_dataset`, `ix_dataset_profiles_version_created`.

### `column_profiles` (Task 3)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_profile_id` | UUID NOT NULL FK → `dataset_profiles.id` ON DELETE CASCADE | Unique per `(name)` and per `(ordinal_position)`. |
| `name` | VARCHAR(255) NOT NULL | Column name. |
| `ordinal_position` | INT NOT NULL | 1-based position from the source file. |
| `metrics` | JSONB NOT NULL | Per-column metrics: `physical_type`, `sample_size`, `non_null_count`, `null_count`, `null_rate`, `distinct_count`, `distinct_rate`, `top_values[]`, `numeric{min,max,mean,median,std,sum}`, `temporal{min,max}`, `string_length{min,max,mean}`. |

Indexes: `uq_column_profiles_name`, `uq_column_profiles_ordinal`, `ix_column_profiles_dataset_profile`.

### `findings` (Task 4)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | Finding scope. |
| `dataset_version_id` | UUID NOT NULL FK → `dataset_versions.id` ON DELETE CASCADE | Profiled version the finding refers to. |
| `profile_id` | UUID NOT NULL FK → `dataset_profiles.id` ON DELETE CASCADE | Source profile. |
| `kind` | enum `finding_kind` | `missingness`, `duplicates`, `invalid_values`, `outlier`, `cardinality`. |
| `severity` | enum `finding_severity` | `info`, `low`, `medium`, `high`, `critical`. |
| `column_name` | VARCHAR(255) NULL | NULL for dataset-level findings (e.g. duplicates). |
| `metric` | VARCHAR(64) NOT NULL | Detector metric identifier (e.g. `null_rate`, `duplicate_rate`). |
| `value` | FLOAT NOT NULL | Observed metric value. |
| `threshold` | FLOAT NOT NULL | Detector threshold. |
| `description` | VARCHAR(1024) NOT NULL | Human-readable summary. |
| `details` | JSONB NOT NULL | Detector-specific evidence. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Insertion timestamp. |

Indexes: `ix_findings_dataset_version`, `ix_findings_profile`, `ix_findings_kind_severity`.

### `quality_scores` (Task 5)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | Scoring scope. |
| `dataset_version_id` | UUID NOT NULL FK → `dataset_versions.id` ON DELETE CASCADE | Version the score refers to. |
| `profile_id` | UUID NOT NULL FK → `dataset_profiles.id` ON DELETE CASCADE | Source profile whose finding batch was scored. |
| `finding_count` | INT NOT NULL | Findings aggregated by the run. |
| `score` | FLOAT NOT NULL | Deterministic 0–100 quality score (see `backend/docs/scoring.md`). |
| `grade` | enum `quality_grade` | `A`, `B`, `C`, `D`, `F` (derived from `score`). |
| `formula_version` | VARCHAR(64) NOT NULL | Identifier of the scoring formula (current default `task5-1.0`). |
| `components` | JSONB NOT NULL | Decomposable breakdown: `by_kind`, `by_severity`, `by_column`, `overall_penalty_total`, `overall_penalty_normalized`, `column_count`, `per_finding[]` (each entry carries `detection_confidence`, `data_error_confidence`, `penalty`). |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Insertion timestamp. |

Indexes: `ix_quality_scores_dataset_created`, `ix_quality_scores_profile`, `ix_quality_scores_grade`.

### `recommendations` (Task 8)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | Recommendation scope. |
| `profile_id` | UUID NOT NULL FK → `dataset_profiles.id` ON DELETE CASCADE | Source profile whose findings produced the recommendation. |
| `kind` | VARCHAR(64) NOT NULL | `missingness_treatment`, `duplicate_removal`, `outlier_treatment`, `data_quality_fix`, `cardinality_reduction`, `schema_normalization`, `pipeline_review`. |
| `severity` | VARCHAR(32) NOT NULL | `info`, `low`, `medium`, `high`, `critical`. |
| `title` | VARCHAR(255) NOT NULL | Short human-readable recommendation title. |
| `rationale` | VARCHAR(2000) NOT NULL | Human-readable explanation that points back to the source finding. |
| `affected_columns` | JSONB NOT NULL | Array of column names (or `<dataset>` for dataset-level). |
| `supporting_finding_ids` | JSONB NOT NULL | Array of UUID strings for the Task 4 findings that produced the recommendation. |
| `confidence` | FLOAT NOT NULL | Bounded `[0, 1]`; derived from `detection_confidence * data_error_confidence`. |
| `priority` | INT NOT NULL | Integer ordering signal derived from severity weight and confidence. |
| `operation_kind` | VARCHAR(64) NULL | `impute_missing`, `drop_column`, `drop_duplicates`, `cap_outliers`, `cast_type`, `group_rare_categorical`, `review`. |
| `operation_params` | JSONB NOT NULL | Operation-specific structured parameters. |
| `preview_only` | BOOLEAN NOT NULL | Always `True` in Task 8; the apply step lands in Task 9. |
| `formula_version` | VARCHAR(64) NOT NULL | Identifier of the rule engine (current default `task8-1.0`). |
| `components` | JSONB NOT NULL | Decomposable breakdown: `by_kind`, `by_severity`, `score`, `interpretation_id`, `formula_version`, `generated_at`, `findings[]`. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Insertion timestamp. |

Indexes: `ix_recommendations_dataset_created`, `ix_recommendations_profile`, `ix_recommendations_kind_severity`, `ix_recommendations_formula`.

### `validations` (Task 9)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | Validation scope. |
| `dataset_version_id` | UUID NOT NULL FK → `dataset_versions.id` ON DELETE CASCADE | Source dataset version. |
| `profile_id` | UUID NOT NULL FK → `dataset_profiles.id` ON DELETE CASCADE | Source profile. |
| `recommendation_id` | UUID NOT NULL FK → `recommendations.id` ON DELETE CASCADE | Source Task 8 recommendation. |
| `operation_kind` | VARCHAR(64) NOT NULL | Constrained operation kind (mirrors Task 8). |
| `status` | VARCHAR(32) NOT NULL | `valid`, `warning`, `invalid`. |
| `title` | VARCHAR(255) NOT NULL | Short human-readable preview title. |
| `rationale` | VARCHAR(2000) NOT NULL | Human-readable summary of the projected effect. |
| `impact` | JSONB NOT NULL | Structured preview: `affected_rows`, `affected_columns[]`, `summary`, `unexpected_side_effects[]`. |
| `components` | JSONB NOT NULL | Source pointers for audit: `dataset_id`, `dataset_version_id`, `profile_id`, `recommendation_id`, `operation_kind`, `supporting_finding_ids[]`, `preview_status`, `formula_version`. |
| `formula_version` | VARCHAR(64) NOT NULL | Identifier of the preview engine (current default `task9-1.0`). |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Insertion timestamp. |

Indexes: `ix_validations_dataset_created`, `ix_validations_recommendation`, `ix_validations_status`, `ix_validations_formula`.

### `jobs` (Task 10)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_id` | UUID NOT NULL FK → `datasets.id` ON DELETE CASCADE | Job scope. |
| `profile_id` | UUID NULL FK → `dataset_profiles.id` ON DELETE SET NULL | Source profile when the wrapped operation is profile-bound; nullable for dataset-level jobs. |
| `kind` | VARCHAR(64) NOT NULL | `profile`, `detect`, `score`, `history`, `recommendations`, `validations`. |
| `status` | VARCHAR(32) NOT NULL | `pending`, `running`, `succeeded`, `failed`. |
| `title` | VARCHAR(255) NOT NULL | Short human-readable job title. |
| `parameters` | JSONB NOT NULL | Raw inputs as posted (kind, profile_id, parameters map). |
| `result` | JSONB NOT NULL | Structured outcome of the wrapped service method; per-kind shape (see `backend/docs/jobs.md`). |
| `error` | JSONB NOT NULL | Sanitized envelope on failure: `code`, `message`, `details`. Empty `{}` on success. |
| `formula_version` | VARCHAR(64) NOT NULL | Identifier of the dispatcher (current default `task10-1.0`). |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Insertion timestamp. |
| `started_at` | TIMESTAMPTZ NULL | When the wrapped service method was invoked. |
| `completed_at` | TIMESTAMPTZ NULL | When the wrapped service method returned or failed. |

Indexes: `ix_jobs_dataset_created`, `ix_jobs_profile`, `ix_jobs_status`, `ix_jobs_kind`.

## Modeling rules for Task 11+

1. UUID primary keys and timezone-aware `created_at`/`updated_at`.
2. Foreign keys with deliberate delete behavior; no accidental cascades.
3. Index foreign keys and common dataset/version/status lookup paths.
4. `JSONB` only for detector-specific variable metrics/evidence; stable searchable concepts remain columns.
5. Preserve original versions and checksums; approved transformations create new versions.
6. Storage references, not large files or raw rows, live in PostgreSQL.
7. Uniqueness constraints for identities and idempotency.
8. Every migration must support a reasoned upgrade, downgrade, and review.

Exact columns, enums, and retention policy for the Task 11 worker infrastructure will be decided when that task begins rather than guessed now.
