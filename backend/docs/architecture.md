# Architecture

## Status

This document distinguishes **implemented in Task 1 and Task 2** from **planned** behavior.

## System principles

1. Deterministic and statistical components establish what occurred.
2. AI receives structured findings, not unrestricted raw datasets, and interprets meaning and possible action.
3. AI output is advisory and structured. It cannot execute SQL, Python, shell commands, or transformations.
4. Every transformation must pass deterministic validation and require explicit approval before creating a new immutable dataset version.
5. API models are separate from persistence models.

## Implemented component flow (Task 1 + Task 2)

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
  -> Error envelope: { code, message, details, request_id }
  -> Structured request log without request bodies or dataset contents
```

## Planned flow (later tasks)

```text
Polars / DuckDB / PyArrow profiling
  -> independent quality detectors
  -> standardized finding aggregation
  -> objective scoring
  -> provider-independent AI interpretation
  -> structured recommendation validation
  -> explicit approval + deterministic transformation
  -> post-change validation + new dataset version
  -> quality report
```

## Package responsibilities

- `app/api`: HTTP routing only. Routes call services, not persistence code.
- `app/core`: typed settings, structured logging, request middleware, application exceptions, error envelope.
- `app/db`: SQLAlchemy declarative base, engine/session factory, models, repositories.
- `app/schemas`: Pydantic v2 contracts for every endpoint; SQLAlchemy entities are never returned directly.
- `app/ingestion`: file content validation, format-aware metadata readers, ingestion domain types and exceptions.
- `app/storage`: pluggable `FileStorage` interface with a `LocalFileStorage` implementation (staging, key-validated promote, delete).
- `app/services`: orchestration (`DatasetService`) that wires storage, validator, readers, repository, and the session boundary.
- `migrations/`: Alembic environment and revisions against `app.db.base.Base.metadata`.
- `tests/`: unit, API, and opt-in PostgreSQL integration tests.

Later tasks add `profiling`, `quality`, `analysis`, `ai`, `recommendations`, `validation`, and additional models/repositories only when their behavior exists.

## Technology decisions

### Synchronous SQLAlchemy initially

FastAPI `def` handlers run in the worker threadpool. psycopg 3 plus a bounded synchronous pool is simpler and reliable for the current metadata workload. Async SQLAlchemy would not accelerate Polars/DuckDB CPU or file analysis and would add a second concurrency model prematurely. The session boundary permits a future switch if measured API database contention justifies it.

### PostgreSQL only

Configuration rejects SQLite and legacy psycopg2 URLs. Unit tests use test doubles; integration tests target a real disposable PostgreSQL instance.

### Polars + PyArrow now; DuckDB later

CSV metadata is extracted with Polars `scan_csv` (lazy, streaming) so we never materialize full datasets. Parquet metadata is read from the Arrow footer via PyArrow. DuckDB enters only when analytical or multi-dataset joins need it.

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
- Authentication is not implemented. Production data endpoints will require an explicit auth/tenant design before exposure.

## Deployment

Docker Compose is a local-development convenience, not a production topology. Production should provide managed PostgreSQL, secrets management, TLS termination, independently scaled API/workers, durable object storage, monitoring, and backups.
