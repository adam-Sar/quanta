# Data model

## Task 3 state

`0001_foundation` establishes a concrete Alembic head. `0002_dataset_ingestion` creates the durable tables for logical datasets and their immutable versions. `0003_create_dataset_profiles` adds immutable profile runs and JSONB per-column metrics. No AI, detection, scoring, or recommendation tables exist yet.

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

### `dataset_profiles`

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

### `column_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Default `uuid4()`. |
| `dataset_profile_id` | UUID NOT NULL FK → `dataset_profiles.id` ON DELETE CASCADE | Unique per `(name)` and per `(ordinal_position)`. |
| `name` | VARCHAR(255) NOT NULL | Column name. |
| `ordinal_position` | INT NOT NULL | 1-based position from the source file. |
| `metrics` | JSONB NOT NULL | Per-column metrics: `physical_type`, `sample_size`, `non_null_count`, `null_count`, `null_rate`, `distinct_count`, `distinct_rate`, `top_values[]`, `numeric{min,max,mean,median,std,sum}`, `temporal{min,max}`, `string_length{min,max,mean}`. |

Indexes: `uq_column_profiles_name`, `uq_column_profiles_ordinal`, `ix_column_profiles_dataset_profile`.

## Modeling rules for Task 4+

1. UUID primary keys and timezone-aware `created_at`/`updated_at`.
2. Foreign keys with deliberate delete behavior; no accidental cascades.
3. Index foreign keys and common dataset/version/status lookup paths.
4. `JSONB` only for detector-specific variable metrics/evidence; stable searchable concepts remain columns.
5. Preserve original versions and checksums; approved transformations create new versions.
6. Storage references, not large files or raw rows, live in PostgreSQL.
7. Uniqueness constraints for identities and idempotency.
8. Every migration must support a reasoned upgrade, downgrade, and review.

Exact columns, enums, and retention policy will be decided with Task 4 detection and Task 6 historical comparison rather than guessed now.