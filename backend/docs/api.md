# Backend API

**Current version:** 0.2.0 (Task 2 ingestion). Interactive OpenAPI is available at `/docs`; machine-readable OpenAPI is `/openapi.json`.

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
  "version": "0.2.0",
  "environment": "production",
  "timestamp": "2026-07-30T08:45:10.381Z"
}
```

### `GET /health/ready`

Verifies PostgreSQL connectivity with a `SELECT 1`.

**200**

```json
{ "status": "ready", "checks": { "database": "up" }, "timestamp": "2026-07-30T08:45:10.412Z" }
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

## Error contract

All errors use:

```json
{ "error": { "code": "string", "message": "string", "details": { ... } | [ ... ] | null, "request_id": "string" } }
```

| Status | Expected codes |
|---|---|
| 400 | `empty_upload`, `invalid_dataset_file` |
| 404 | `dataset_not_found` |
| 413 | `upload_too_large` |
| 415 | `unsupported_file_format` |
| 422 | `validation_error` |
| 500 | `internal_error` |
| 503 | `database_unavailable` |

Specific codes are not final; the envelope and `X-Request-ID` propagation are.

## API changes since Task 1

- Added `POST /datasets` (multipart) and the `DatasetService.ingest` flow.
- Added `GET /datasets`, `GET /datasets/{dataset_id}`, `GET /datasets/{dataset_id}/versions`.
- Added standardized `400`, `413`, `415`, and `404` error envelopes for dataset endpoints.
- `X-Request-ID` is now included in the response headers of every endpoint.
