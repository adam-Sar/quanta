# Future frontend integration contract

> **Implementation status:** `GET /health`, `GET /health/ready`, and the dataset ingestion, profiling, detection, and scoring endpoints exist through Task 5. Recommendation, validation, analysis-job, and AI endpoints remain planned. No frontend has been created.

## Transport and discovery

Development base URL is `http://localhost:8000`. JSON is used except file upload (`multipart/form-data`). OpenAPI is `/openapi.json`. Timestamps are UTC RFC 3339; identifiers are UUID strings. The frontend should generate and send `X-Request-ID` for each call and retain the returned value in error telemetry.

Production origins, TLS, and CORS are deployment concerns. CORS is intentionally not enabled in Task 2 because no trusted frontend origin exists yet.

## Authentication assumption

Health routes are public. Before data endpoints become production-accessible, an authentication/authorization task must define OIDC/OAuth2 bearer tokens, tenant/workspace claims, dataset-level authorization, and audit identity. The frontend should plan an `Authorization: Bearer <token>` header, but the backend does not accept or validate it today. No fake authentication is provided.

## Implemented endpoints

### `GET /health`

Use for process liveness, not application gating.

```json
{
  "status": "ok",
  "service": "Quanta Data Reliability API",
  "version": "0.2.0",
  "environment": "development",
  "timestamp": "2026-07-30T08:45:10.381Z"
}
```

### `GET /health/ready`

Use for environment diagnostics; a 503 means the UI should show the service as temporarily unavailable and may retry with backoff.

```json
{ "status": "ready", "checks": { "database": "up" }, "timestamp": "2026-07-30T08:45:10.412Z" }
```

### `POST /datasets`

Multipart upload. Returns 201 with the dataset including its first immutable version. Rejects empty/oversize/unsupported files and validation errors.

### `GET /datasets`

Paginated dataset list with their `current_version`. Use this to populate dataset browsers.

### `GET /datasets/{dataset_id}`

Fetch a single dataset with its current version. 404 for unknown IDs.

### `GET /datasets/{dataset_id}/versions`

Paginated list of all immutable versions of a dataset, newest first. 404 if the dataset does not exist.

## Error handling

All errors use one envelope:

```json
{
  "error": {
    "code": "upload_too_large",
    "message": "The uploaded file exceeds the configured size limit.",
    "details": { "max_size_bytes": 1048576 },
    "request_id": "ui-01J3Q9K1S9"
  }
}
```

Display `message`; use `code` for behavior; map field-level `details` to forms where relevant; include `request_id` in support flows. Never display raw 500 bodies.

## Planned endpoint inventory

| Endpoint | Intended backend task | Status |
|---|---:|---|
| `POST /datasets` | 2 | Implemented |
| `GET /datasets` | 2 | Implemented |
| `GET /datasets/{dataset_id}` | 2 | Implemented |
| `GET /datasets/{dataset_id}/versions` | 2 | Implemented |
| `POST /datasets/{dataset_id}/profile` | 3 | Planned |
| `GET /datasets/{dataset_id}/profile` | 3 | Planned |
| `POST /datasets/{dataset_id}/profile` | 3 | Implemented |
| `GET /datasets/{dataset_id}/profile` | 3 | Implemented |
| `GET /datasets/{dataset_id}/profiles` | 3 | Implemented |
| `POST /datasets/{dataset_id}/detections` | 4 | Implemented |
| `GET /datasets/{dataset_id}/detections` | 4 | Implemented |
| `POST /datasets/{dataset_id}/scores` | 5 | Implemented |
| `GET /datasets/{dataset_id}/score` | 5 | Implemented |
| `GET /datasets/{dataset_id}/scores` | 5 | Implemented |
| `POST /datasets/{dataset_id}/analyze` | 4/10 | Planned |
| `GET /datasets/{dataset_id}/findings` | 4/10 | Planned |
| `GET /datasets/{dataset_id}/findings/{finding_id}` | 4/10 | Planned |
| `GET /datasets/{dataset_id}/recommendations` | 8/10 | Planned |
| `POST /recommendations/{id}/validate` | 9/10 | Planned |
| `POST /recommendations/{id}/apply` | after validation/approval | Planned |
| `POST /datasets/compare` | 6/10 | Planned |
| `GET /analysis/{analysis_job_id}` | 10/11 | Planned |

Names may change only through a documented contract revision before frontend implementation.

## Planned upload behavior (Task 2 reference)

`POST /datasets` accepts multipart fields `file`, `name`, and optional `description`. A 201 response is returned only when streaming, validation, metadata extraction, and the database write all succeed. Errors roll back the database and delete any staged or promoted file to keep storage in sync. The frontend should use upload progress from its HTTP client and must not assume analysis progress from upload bytes.

## Pagination reference (Task 2)

Collection endpoints use `page` ≥ 1 (default 1) and `page_size` 1–200 (default 50). Responses use the stable envelope:

```json
{
  "items": [],
  "pagination": { "page": 1, "page_size": 50, "total_items": 0, "total_pages": 0 }
}
```

Sorting and filter fields will be defined with the first collection that needs them; do not invent parameters before then.

## Planned finding presentation

The frontend retrieves findings by dataset/version with filters for severity, detector type, and column. It should display objective severity, detection confidence, data-error confidence, affected scope, metrics/evidence, and a separate AI interpretation. Never present a statistical anomaly as a confirmed error merely because detection confidence is high.

```json
{
  "id": "d687fa08-4a16-44ec-a9bb-2dcad5e56629",
  "detector_type": "missingness",
  "severity": "high",
  "detection_confidence": 0.99,
  "data_error_confidence": 0.67,
  "column": "email",
  "affected_rows": 57068,
  "affected_percentage": 17.3,
  "metrics": { "null_rate": 0.173 },
  "title": "High missingness in email"
}
```

## Planned recommendation and validation UX

Recommendations are constrained operations (for example `map_values`) with rationale, assumptions, confidence, linked findings, and lifecycle status. The UI must never run returned text as code. Before enabling Apply, call validation and show impact:

```json
{
  "recommendation_id": "5fa8dac2-e53f-4886-a3ee-88d0de908168",
  "valid": true,
  "status": "validated",
  "impact": {
    "affected_rows": 12431,
    "affected_columns": ["country"],
    "row_count_before": 329881,
    "row_count_after": 329881,
    "inconsistency_rate_before": 4.2,
    "inconsistency_rate_after": 0.3,
    "unexpected_side_effects": []
  }
}
```

Validation can fail and must leave Apply disabled. A later apply call requires explicit confirmation, optimistic state/version controls, and creates a new dataset version; it never mutates the source version.

## Planned analysis jobs

Long-running analysis will return `202 Accepted`, not hold a browser request indefinitely:

```json
{
  "analysis_job_id": "aa5ef46f-a66e-4ef0-a03f-9c06c677c48e",
  "dataset_id": "5a8581da-0279-4a58-9f09-22f06dceaa10",
  "dataset_version_id": "690b72a0-b1eb-4161-b1a1-780bdd0715df",
  "status": "queued",
  "created_at": "2026-07-30T09:03:00Z"
}
```

`GET /analysis/{id}` returns `queued`, `running`, `completed`, or `failed`, with progress only when objectively measurable, timestamps, and a safe failure object. Initially the frontend can poll with bounded exponential backoff and stop at terminal states. SSE is preferred later for one-way status/findings events; WebSockets are unnecessary unless bidirectional interaction appears. A task queue/Redis will remain an internal change and must not alter the job resource.
