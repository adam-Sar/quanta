# Backend API

**Current version:** 0.6.0 (Task 6 history). Interactive OpenAPI is available at `/docs`; machine-readable OpenAPI is `/openapi.json`.

## Conventions

- JSON timestamps are RFC 3339 UTC.
- Every response includes `X-Request-ID`. Send a safe `X-Request-ID` (1–128 letters, numbers, `.`, `_`, `:`, or `-`) to correlate calls.
- Domain UUIDs serialize as canonical lowercase UUID strings.
- Database models are never public response models.
- All endpoints use a consistent error envelope; see the contract section.

## Health

### `GET /health`

Process liveness. Does not access PostgreSQL.

**200**

```json
{
  "status": "ok",
  "service": "Quanta Data Reliability API",
  "version": "0.6.0",
  "environment": "production",
  "timestamp": "2026-07-30T20:30:00.381Z"
}
```

### `GET /health/ready`

Verifies PostgreSQL connectivity with a `SELECT 1`.

**200**

```json
{ "status": "ready", "checks": { "database": "up" }, "timestamp": "2026-07-30T20:30:00.412Z" }
```

**503** uses the standard error envelope; the request never exposes hostnames, credentials, or driver messages.

## Datasets

### `POST /datasets`

Upload a CSV or Parquet file. The first immutable version is created. Streaming, size-checked, content-validated.

**Form fields**

- `file`: required, `text/csv` or application/octet-stream with `.csv`/`.parquet` extension.
- `name`: required, 1–255 characters after trimming.
- `description`: optional, up to 2000 characters after trimming.

**201**

```json
{
  "id": "5a8581da-0279-4a58-9f09-22f06dceaa10",
  "name": "people",
  "description": null,
  "created_at": "2026-07-30T09:00:00Z",
  "updated_at": "2026-07-30T09:00:00Z",
  "current_version": {
    "id": "690b72a0-b1eb-4161-b1a1-780bdd0715df",
    "version_number": 1,
    "format": "csv",
    "status": "stored",
    "original_filename": "people.csv",
    "media_type": "text/csv",
    "size_bytes": 8421772,
    "row_count": 329881,
    "column_count": 12,
    "content_sha256": "f3a9...",
    "created_at": "2026-07-30T09:00:00Z",
    "columns": [
      { "name": "id", "ordinal_position": 1, "physical_type": "Int64", "logical_type": "integer", "nullable": null }
    ]
  }
}
```

**400** empty upload, **413** oversize, **415** unsupported extension, **422** validation error.

### `GET /datasets`

List datasets paginated by creation time, including their `current_version`.

**Query parameters**

- `page` ≥ 1 (default 1).
- `page_size` 1–200 (default 50).

**200**

```json
{
  "items": [ /* DatasetResponse objects */ ],
  "pagination": { "page": 1, "page_size": 50, "total_items": 3, "total_pages": 1 }
}
```

### `GET /datasets/{dataset_id}`

Fetch a single dataset with its current version. **404** if not found.

### `GET /datasets/{dataset_id}/versions`

List every immutable version of a dataset ordered by `version_number` desc. **404** if dataset not found.

**200**

```json
{
  "items": [ /* DatasetVersionResponse objects */ ],
  "pagination": { "page": 1, "page_size": 10, "total_items": 3, "total_pages": 1 }
}
```

## Profiles (Task 3)

### `POST /datasets/{dataset_id}/profile`

Compute a fresh deterministic profile over the latest immutable version of the dataset. Profiling is read-only; the original file is never mutated. A new `DatasetProfile` row plus one `ColumnProfile` JSONB row per column are written in a single transaction.

**201**

```json
{
  "profile_id": "8d4f2c40-6b29-4a90-9f8f-1dbf8cf01a2c",
  "dataset_id": "5a8581da-0279-4a58-9f09-22f06dceaa10",
  "dataset_version_id": "690b72a0-b1eb-4161-b1a1-780bdd0715df",
  "sample_size": 329881,
  "sampled": "full",
  "started_at": "2026-07-30T09:05:01.120+00:00",
  "completed_at": "2026-07-30T09:05:01.452+00:00",
  "duration_ms": 332,
  "columns": [
    {
      "name": "id",
      "ordinal_position": 1,
      "metrics": {
        "physical_type": "Int64",
        "sample_size": 329881,
        "non_null_count": 329881,
        "null_count": 0,
        "null_rate": 0.0,
        "distinct_count": 329881,
        "distinct_rate": 1.0,
        "top_values": [
          { "value": "1024", "count": 1, "frequency": 0.0000030 }
        ],
        "numeric": {
          "min": 1, "max": 329881, "mean": 164941.0,
          "median": 164941.0, "std": 95210.5, "sum": 54420589321
        },
        "temporal": { "min": null, "max": null },
        "string_length": { "min": null, "max": null, "mean": null }
      }
    }
  ]
}
```

**404** if the dataset does not exist, **409** if no dataset version exists yet, **422** if the stored file cannot be read, **500** for unexpected storage failures.

### `GET /datasets/{dataset_id}/profile`

Return the most recently created profile for the dataset's latest version. **404** if the dataset is unknown, **409** if no profile run exists yet.

### `GET /datasets/{dataset_id}/versions/{version_id}/profile`

Return the most recently created profile for a specific immutable version. **404** if the dataset is unknown, **409** if the version or any profile run is unknown.

### `GET /datasets/{dataset_id}/profiles`

List every profile run for a dataset, ordered by creation time desc. **404** if the dataset is unknown.

**Query parameters**

- `page` ≥ 1 (default 1).
- `page_size` 1–200 (default 50).

**200**

```json
{
  "items": [ /* DatasetProfileResponse objects */ ],
  "pagination": { "page": 1, "page_size": 50, "total_items": 2, "total_pages": 1 }
}
```

## Detections (Task 4)

### `POST /datasets/{dataset_id}/detections`

Run all Task 4 detectors (missingness, duplicates, invalid values, outliers, cardinality) against the most recently created profile and persist a fresh batch of immutable `Finding` rows.

**201**

```json
{
  "dataset_id": "5a8581da-0279-4a58-9f09-22f06dceaa10",
  "profile_id": "8d4f2c40-6b29-4a90-9f8f-1dbf8cf01a2c",
  "finding_count": 3,
  "findings": [
    {
      "finding_id": "f47a...c1",
      "dataset_id": "5a8581da-...",
      "dataset_version_id": "690b72a0-...",
      "profile_id": "8d4f2c40-...",
      "kind": "missingness",
      "severity": "high",
      "column_name": "email",
      "metric": "null_rate",
      "value": 0.62,
      "threshold": 0.5,
      "description": "Column 'email' has 19,433 null values (62.0%) which is above the threshold (50.0%).",
      "details": {
        "null_count": 19433,
        "non_null_count": 11911,
        "sample_size": 31344
      }
    }
  ]
}
```

**404** if the dataset does not exist; **409** if the dataset has no profile yet.

### `GET /datasets/{dataset_id}/detections`

List every finding row for a dataset, ordered by creation time desc. **404** if the dataset is unknown.

**Query parameters**

- `page` ≥ 1 (default 1).
- `page_size` 1–200 (default 50).

**200**

```json
{
  "items": [ /* FindingResponse objects */ ],
  "pagination": { "page": 1, "page_size": 50, "total_items": 3, "total_pages": 1 }
}
```

## Quality scores (Task 5)

### `POST /datasets/{dataset_id}/scores`

Run the deterministic scoring formula against the latest detection batch of a dataset. Persists a fresh immutable `QualityScore` row bound to the latest profile. **404** if the dataset does not exist; **409** if it exists but has no detection batch yet.

**201**

```json
{
  "score_id": "7c9a3df0-9f0c-4d7a-9d8e-bf70eef21c6e",
  "dataset_id": "5a8581da-0279-4a58-9f09-22f06dceaa10",
  "dataset_version_id": "690b72a0-b1eb-4161-b1a1-780bdd0715df",
  "profile_id": "8d4f2c40-6b29-4a90-9f8f-1dbf8cf01a2c",
  "finding_count": 3,
  "score": 74.32,
  "grade": "B",
  "formula_version": "task5-1.0",
  "components": {
    "by_kind": {
      "missingness": { "count": 2, "penalty_total": 0.6123, "penalty_normalized": 0.2041 }
    },
    "by_severity": {
      "medium": { "count": 2, "penalty_total": 0.6123, "penalty_normalized": 0.2041 }
    },
    "by_column": {
      "email": { "count": 1, "penalty_total": 0.3061, "penalty_normalized": 0.1020 }
    },
    "overall_penalty_total": 0.6123,
    "overall_penalty_normalized": 0.2568,
    "column_count": 3,
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
  },
  "created_at": "2026-07-30T09:30:00.123Z"
}
```

### `GET /datasets/{dataset_id}/score`

Return the most recently created score for the dataset's latest version. **404** if the dataset is unknown, **409** if no score run exists yet.

### `GET /datasets/{dataset_id}/versions/{version_id}/score`

Return the most recently created score for a specific immutable version. **404** if the dataset is unknown, **409** if the version is unknown or no score run exists yet.

### `GET /datasets/{dataset_id}/scores`

List every score run for a dataset, ordered by creation time desc. **404** if the dataset is unknown.

**Query parameters**

- `page` ≥ 1 (default 1).
- `page_size` 1–200 (default 50).

**200**

```json
{
  "items": [ /* QualityScoreResponse objects */ ],
  "pagination": { "page": 1, "page_size": 50, "total_items": 2, "total_pages": 1 }
}
```


## History comparisons (Task 6)

### `POST /datasets/{dataset_id}/comparisons`

Compute a deterministic history comparison between two dataset versions and persist a fresh immutable `HistoryComparison` row. **404** if the dataset does not exist or one of the versions does not belong to it; **400** if the same version is supplied twice.

**Body**

```json
{
  "base_version_id": "690b72a0-b1eb-4161-b1a1-780bdd0715df",
  "target_version_id": "7c9a3df0-9f0c-4d7a-9d8e-bf70eef21c6e"
}
```

**201**

```json
{
  "comparison_id": "8d4f2c40-6b29-4a90-9f8f-1dbf8cf01a2c",
  "dataset_id": "5a8581da-0279-4a58-9f09-22f06dceaa10",
  "base_version_id": "690b72a0-b1eb-4161-b1a1-780bdd0715df",
  "target_version_id": "7c9a3df0-9f0c-4d7a-9d8e-bf70eef21c6e",
  "formula_version": "task6-1.0",
  "schema_diff": {"added": ["email"], "removed": [], "type_changes": []},
  "distribution_drift": {"numeric": [], "categorical": []},
  "score_drift": {
    "base_score": 80.0, "target_score": 70.0,
    "delta": -10.0, "absolute_delta": 10.0,
    "base_grade": "B", "target_grade": "C",
    "grade_changed": true
  },
  "created_at": "2026-07-30T10:00:00.000+00:00"
}
```

### `GET /datasets/{dataset_id}/comparisons/{comparison_id}`

Return a single persisted comparison row. **404** if the comparison does not exist.

### `GET /datasets/{dataset_id}/comparisons`

List every comparison run for a dataset, ordered by creation time desc. **404** if the dataset is unknown.

**Query parameters**

- `page` >= 1 (default 1).
- `page_size` 1-200 (default 50).

### `GET /datasets/{dataset_id}/lineage`

Walk the version chain and return the ordered lineage edges. **404** if the dataset is unknown.

## Error contract

All errors use:

```json
{ "error": { "code": "string", "message": "string", "details": { ... } | [ ... ] | null, "request_id": "string" } }
```

| Status | Expected codes |
|---|---|
| 400 | `empty_upload`, `invalid_dataset_file` |
| 404 | `dataset_not_found`, `version_not_found` |
| 409 | `scoring_not_scoreable` |
| 409 | `dataset_not_profileable`, `detection_not_profileable`, `scoring_not_scoreable`, `invalid_profile_state`, `invalid_detection_state`, `invalid_scoring_state` |
| 413 | `upload_too_large` |
| 415 | `unsupported_file_format` |
| 422 | `validation_error` |
| 500 | `internal_error`, `profile_storage_error` |
| 503 | `database_unavailable` |

Specific codes are not final; the envelope and `X-Request-ID` propagation are.

## API changes since Task 4

- Added `POST /datasets/{dataset_id}/scores` (201), `GET /datasets/{dataset_id}/score` (200), `GET /datasets/{dataset_id}/versions/{version_id}/score` (200), and `GET /datasets/{dataset_id}/scores` (200 paginated list).
- Added `scoring_not_scoreable` (409) and `invalid_scoring_state` (422) codes.
- Persisted `quality_scores` rows carry a documented `formula_version` and a JSONB `components` breakdown (per-kind / per-severity / per-column / per-finding) including both detection and data-error confidences. See `backend/docs/scoring.md` for the formula.
- `X-Request-ID` continues to be included in the response headers of every endpoint.
