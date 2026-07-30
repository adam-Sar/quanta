# Backend development

## Requirements

- Python 3.12+
- PostgreSQL 16 recommended
- Docker Desktop (optional)

## Run with Docker

From the repository root:

```bash
copy .env.example .env
docker compose up --build
```

On POSIX shells use `cp` instead of `copy`. Compose starts PostgreSQL, applies the Alembic foundation, dataset ingestion, profile, and findings migrations, and serves FastAPI on port 8000.

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
docker compose down
```

Use `docker compose down -v` only when intentionally deleting local database and storage volumes.

## Run directly

From `backend/` in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
$env:DATABASE_URL = "postgresql+psycopg://quanta:quanta@localhost:5432/quanta"
alembic upgrade head
uvicorn app.main:app --reload
```

`/health` is always live. `/health/ready` returns 503 until PostgreSQL is available. The compose service applies Alembic before starting Uvicorn.

## Commands

```bash
pytest
ruff check .
ruff format --check .
mypy app tests
alembic heads
alembic current
```

Run the opt-in real database tests only against a disposable database:

```powershell
$env:RUN_DATABASE_TESTS = "1"
pytest -m integration
```

## Configuration

Copy `.env.example` to `.env`; never commit `.env`. Important current settings:

| Variable | Purpose |
|---|---|
| `ENVIRONMENT` | `development`, `test`, `staging`, or `production` |
| `LOG_LEVEL` | Standard uppercase logging level |
| `LOG_FORMAT` | `json` for machines or `console` locally |
| `DATABASE_URL` | Must use `postgresql+psycopg://` |
| `DATABASE_POOL_SIZE` | Persistent pool connections per process |
| `DATABASE_MAX_OVERFLOW` | Temporary connections above pool size |
| `DATABASE_POOL_TIMEOUT_SECONDS` | Maximum pool checkout wait |
| `STORAGE_PATH` | Local filesystem root for stored datasets |
| `MAX_UPLOAD_SIZE_MB` | Hard limit applied during streaming ingestion |
| `UPLOAD_CHUNK_SIZE_BYTES` | Streaming chunk size for staging |
| `CSV_INFER_SCHEMA_LENGTH` | Rows Polars uses to infer CSV schema |
| `PROFILE_DEFAULT_SAMPLE_ROWS` | Upper bound on rows profiled per run |
| `PROFILE_TOP_VALUES_LIMIT` | Maximum top-values rows persisted per column |
| `PROFILE_MAX_BYTES_IN_MEMORY` | Operator-facing safety budget for in-memory profiling |
| `PROFILE_NULL_THRESHOLD` | Default threshold feeding the Task 4 missingness detector |
| `SCORE_FORMULA_VERSION` | Identifier persisted on every Task 5 `QualityScore` row |
| `SCORE_NORMALIZATION_DIVISOR_FLOOR` | Reserved floor for the score normalization divisor |
| `SCORE_MAX_COLUMNS_FOR_NORMALIZATION` | Reserved upper bound on columns used for normalization |
| `HISTORY_FORMULA_VERSION` | Identifier persisted on every Task 6 history comparison row |
| `HISTORY_NUMERIC_RELATIVE_CHANGE_MEDIUM` | Soft numeric drift bar |
| `HISTORY_NUMERIC_RELATIVE_CHANGE_HIGH` | Hard numeric drift bar |
| `HISTORY_CATEGORICAL_PSI_LOW` | PSI low band |
| `HISTORY_CATEGORICAL_PSI_MEDIUM` | PSI high band |
| `HISTORY_SCORE_DELTA_LOW` | Quality-score low band |
| `HISTORY_SCORE_DELTA_MEDIUM` | Quality-score medium band |
| `HISTORY_SCORE_DELTA_HIGH` | Quality-score high band |

Storage, LLM, and Redis variables are listed as future configuration contracts but remain unused in Task 6.

## Structure

```text
backend/
  app/
    api/routes/{health,datasets,profiles,findings,scores,history}.py
    core/{config,exceptions,logging,middleware}.py
    db/{base,session}.py
    db/models/{dataset,profile,finding,quality_score,history_comparison}.py
    db/repositories/{datasets,profiles,findings,quality_scores,history_comparisons}.py
    detection/{types,exceptions,detectors,service}.py
    ingestion/{types,exceptions,validators,readers}.py
    profiling/{types,exceptions,metrics,service}.py
    scoring/{types,exceptions,formula,service}.py
    history/{types,exceptions,comparison,drift,lineage,service}.py
    schemas/{common,datasets,health,profiles,findings,scores,history}.py
    services/{dataset_service,exceptions}.py
    storage/{files}.py
    api/{dependencies,router}.py
    main.py
  migrations/
  tests/{api,integration,unit}/
  docs/
```

## Dataset ingestion lifecycle

1. `POST /datasets` multipart upload with `file`, `name`, and optional `description`.
2. `FileStorage.stage` streams the body in bounded chunks, computes SHA-256 and size, and rejects empty/oversize uploads.
3. `DatasetFileValidator` checks the format (`.csv` UTF-8 header or `.parquet` PAR1 magic).
4. `MetadataReaderRegistry` runs Polars or PyArrow to extract row count and column metadata.
5. `DatasetService.ingest` builds the new dataset/version/column entities, calls `promote` to move the staged file into its generated key, and commits the transaction.
6. Failures roll back the database and either discard the staged file or delete the promoted file to keep storage in sync.

## Profiling lifecycle (Task 3)

1. `POST /datasets/{dataset_id}/profile` resolves the latest immutable dataset version and calls `ProfilingService.profile_latest_version`.
2. The service reads the original via `FileStorage.path_for(storage_key)` (read-only).
3. `DatasetProfiler` loads the file with Polars (`read_csv` with `infer_schema_length` or `read_parquet`), truncates to `head(sample_size)`, and computes per-column metrics (nulls, distinct, numeric, temporal, string length, top values, sampling flag).
4. The service writes a new `DatasetProfile` row plus one `ColumnProfile` JSONB row per column in a single transaction.
5. Database failures roll back the row insert; the original file is never mutated, so no storage compensation is needed.
6. `GET /datasets/{dataset_id}/profile`, `GET /datasets/{dataset_id}/versions/{version_id}/profile`, and `GET /datasets/{dataset_id}/profiles` return the persisted artifacts without recomputing.

## Detection lifecycle (Task 4)

1. `POST /datasets/{dataset_id}/detections` resolves the latest profile and calls `DetectionService.detect_latest`. **404** if the dataset does not exist; **409** if it exists but has no profile yet.
2. The service reads the persisted `JSONB` metrics through `to_api_profile`, runs `run_all_detectors` (missingness, duplicates, invalid values, outliers, cardinality), and writes a fresh batch of immutable `Finding` rows in a single transaction.
3. Database failures roll back the row insert; the original file and the profile rows are never mutated, so no storage compensation is needed.
4. `GET /datasets/{dataset_id}/detections` returns a paginated list of the new finding rows ordered by creation time desc.

## Scoring lifecycle (Task 5)

1. `POST /datasets/{dataset_id}/scores` resolves the latest detection batch and calls `ScoringService.score_latest`. **404** if the dataset does not exist; **409** if it exists but has no detection batch yet.
2. The service reads the immutable `Finding` rows through `FindingRepository.list_for_profile`, runs `compute_quality_score` (two confidence concepts, severity weights, normalized penalty, 0–100 score, A–F grade), and writes a fresh immutable `QualityScore` row in a single transaction.
3. Database failures roll back the row insert; the original file, profile rows, and finding rows are never mutated, so no storage compensation is needed.
4. `GET /datasets/{dataset_id}/score`, `GET .../versions/{version_id}/score`, and `GET .../scores` return the persisted score rows without recomputing. The full formula and rationale are documented in `backend/docs/scoring.md`.

## History lifecycle (Task 6)

1. `POST /datasets/{dataset_id}/comparisons` (Task 6) resolves the two versions, reads the immutable column, profile, column-profile, and quality-score rows, runs `HistoryService.compare_versions`, and persists a fresh immutable `HistoryComparison` row in a single transaction.
2. Database failures roll back the insert only; the original files, profile rows, score rows, and finding rows are never mutated.
3. `GET /datasets/{dataset_id}/comparisons/{comparison_id}` and `GET /datasets/{dataset_id}/comparisons` return the persisted comparison rows without recomputing.
4. `GET /datasets/{dataset_id}/lineage` walks the version chain and returns the ordered lineage edges.
5. The deterministic formula and all thresholds are documented in `backend/docs/history.md`.

## Logging and errors

Every response carries `X-Request-ID`; a safe caller-provided value is preserved. Request completion logs include method, path, status, and duration but never query/body contents. JSON errors use:

```json
{ "error": { "code": "string", "message": "string", "details": { ... } | [ ... ] | null, "request_id": "string" } }