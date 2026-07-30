# Architecture

## Status

This document distinguishes **implemented in Task 1, Task 2, Task 3, Task 4, Task 5, and Task 6** from **planned** behavior.

## System principles

1. Deterministic and statistical components establish what occurred.
2. AI receives structured findings, not unrestricted raw datasets, and interprets meaning and possible action.
3. AI output is advisory and structured. It cannot execute SQL, Python, shell commands, or transformations.
4. Every transformation must pass deterministic validation and require explicit approval before creating a new immutable dataset version.
5. API models are separate from persistence models.

## Implemented component flow (Task 1 + Task 2 + Task 3 + Task 4 + Task 5 + Task 6)

```text
HTTP client
  -> FastAPI request-correlation middleware
  -> Pydantic request/response contract
  -> /datasets routes
      -> DatasetService.ingest
          -> FileStorage.stage
              -> bounded chunked read, SHA-256, size, JSON-on-disk format registry
          -> DatasetFileValidator (CSV/Parquet signature + header)
          -> MetadataReaderRegistry (Polars CSV streaming, PyArrow Parquet)
          -> SQLAlchemy Session / DatasetRepository
              -> datasets + dataset_versions + dataset_columns
          -> FileStorage.promote (atomic os.replace into a generated key)
  -> /datasets/{id}/profile routes (Task 3)
      -> ProfilingService.profile_latest_version / get_latest / get_for_version / list_for_dataset
          -> FileStorage.path_for (read-only)
          -> DatasetProfiler (Polars read_csv / read_parquet, bounded head sample)
              -> null / distinct / numeric / temporal / string-length / top-values / sampling flag
          -> SQLAlchemy Session / ProfileRepository
              -> dataset_profiles + column_profiles (JSONB metrics)
  -> /datasets/{id}/detections routes (Task 4)
      -> DetectionService.detect_latest / list_for_dataset
          -> ProfilingService.to_api_profile (read JSONB metrics)
          -> run_all_detectors (missingness, duplicates, invalid_values, outliers, cardinality)
          -> SQLAlchemy Session / FindingRepository
              -> findings (kind, severity, column_name, metric, value, threshold, JSONB details)
  -> /datasets/{id}/scores routes (Task 5)
  -> /datasets/{id}/comparisons and /datasets/{id}/lineage routes (Task 6)
      -> ScoringService.score_latest / get_latest / get_for_version / list_for_dataset
          -> FindingRepository.list_for_profile (read immutable Task 4 rows)
          -> compute_quality_score (detection_confidence, data_error_confidence,
             severity weights, normalized penalty, 0-100 score, A-F grade)
          -> SQLAlchemy Session / QualityScoreRepository
              -> quality_scores (score, grade, formula_version, JSONB components)
  -> Error envelope: { code, message, details, request_id }
  -> Structured request log without request bodies or dataset contents
```

## Planned flow (later tasks)

```text
Polars / DuckDB / PyArrow profiling (Task 3 done; DuckDB later)
  -> independent quality detectors (Task 4 done)
  -> standardized finding aggregation (Task 5 done)
  -> objective scoring (Task 5 done)
  -> provider-independent AI interpretation (Task 7)
  -> structured recommendation validation (Tasks 8-9)
  -> explicit approval + deterministic transformation
  -> post-change validation + new dataset version
  -> quality report
  -> historical comparison and drift detection (Task 6)
```

## Package responsibilities

- `app/api`: HTTP routing only. Routes call services, not persistence code.
- `app/core`: typed settings, structured logging, request middleware, application exceptions, error envelope.
- `app/db`: SQLAlchemy declarative base, engine/session factory, models, repositories.
- `app/schemas`: Pydantic v2 contracts for every endpoint; SQLAlchemy entities are never returned directly.
- `app/ingestion`: file content validation, format-aware metadata readers, ingestion domain types and exceptions.
- `app/profiling`: deterministic Polars-based column metrics and the `ProfilingService` that persists immutable `DatasetProfile` / `ColumnProfile` rows. No DuckDB in Task 3.
- `app/detection`: threshold-driven deterministic detectors (missingness, duplicates, invalid values, outliers, cardinality) and the `DetectionService` that persists immutable `Finding` rows.
- `app/scoring`: deterministic, explainable quality scoring (Task 5). `compute_quality_score` produces a 0-100 score, an A-F grade, and a per-kind / per-severity / per-column breakdown with both detection and data-error confidences; `ScoringService` persists immutable `QualityScore` rows. AI severity adjustment, recommendations, drift detection, and history comparison live in later tasks.
- `app/storage`: pluggable `FileStorage` interface with a `LocalFileStorage` implementation (staging, key-validated promote, delete, read-only `path_for`).
- `app/services`: orchestration (`DatasetService`) that wires storage, validator, readers, repository, and the session boundary.
- `migrations/`: Alembic environment and revisions against `app.db.base.Base.metadata`.
- `tests/`: unit, API, and opt-in PostgreSQL integration tests.

## Technology decisions

### Synchronous SQLAlchemy initially

FastAPI `def` handlers run in the worker threadpool. psycopg 3 plus a bounded synchronous pool is simpler and reliable for the current metadata workload. Async SQLAlchemy would not accelerate Polars/DuckDB CPU or file analysis and would add a second concurrency model prematurely. The session boundary permits a future switch if measured API database contention justifies it.

### PostgreSQL only

Configuration rejects SQLite and legacy psycopg2 URLs. Unit tests use test doubles; integration tests target a real disposable PostgreSQL instance.

### Polars + PyArrow now; DuckDB later

CSV metadata is extracted with Polars `scan_csv` (lazy, streaming) so we never materialize full datasets. Parquet metadata is read from the Arrow footer via PyArrow. DuckDB enters only when analytical or multi-dataset joins need it. Task 3 profiling uses the same engines and only ever materializes a bounded `head(sample_size)` frame. Task 4 detection reads the persisted JSONB metrics, never re-profiling.

### No Pandas as core engine

Pandas is deliberately avoided. Polars is the dataframe engine; PyArrow is the columnar interchange; DuckDB handles analytical SQL. Pandas appears only if a third-party library genuinely requires it.

### Local file storage abstraction

A `FileStorage` protocol lets the service interface stay constant while later tasks swap in object storage (S3-compatible, etc.). Keys are generated, never user-controlled, and validated against the storage root.

## Security and observability boundaries

- Environment variables own configuration; `.env` is ignored by git.
- Connection strings and secrets are excluded from settings representations.
- Logs contain request metadata, correlation IDs, structured timing, and never request bodies, dataset rows, or file contents.
- Client-supplied `X-Request-ID` is length/character validated before logging and reflected on the response header.
- Unexpected exceptions are logged server-side and sanitized to a stable error envelope on the wire.
- The `ingest` flow commits the database only after a successful on-disk promote; failures delete the staged file (or the promoted file) to keep storage and database in sync.
- Profiling is read-only: it never mutates the original file, so compensation only needs to roll back the inserted `dataset_profiles` / `column_profiles` rows.
- Detection is also read-only: it never mutates the original file or the profile rows, so compensation only needs to roll back the inserted `findings` rows. Scoring and history are read-only as well: they read the persisted profile / score rows and persist fresh immutable score and history comparison rows in single transactions.
- Scoring is also read-only: it never mutates the original file, profile rows, or finding rows; compensation only needs to roll back the inserted `quality_scores` row.
- Authentication is not implemented. Production data endpoints will require an explicit auth/tenant design before exposure.

## Deployment

Docker Compose is a local-development convenience, not a production topology. Production should provide managed PostgreSQL, secrets management, TLS termination, independently scaled API/workers, durable object storage, monitoring, and backups.