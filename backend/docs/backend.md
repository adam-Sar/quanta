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

On POSIX shells use `cp` instead of `copy`. Compose starts PostgreSQL, applies the Alembic foundation and dataset ingestion migrations, and serves FastAPI on port 8000.

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

Run the opt-in real database test only against a disposable database:

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

Storage, LLM, and Redis variables are listed as future configuration contracts but remain unused in Task 2.

## Structure

```text
backend/
  app/
    api/routes/{health,datasets}.py
    core/{config,exceptions,logging,middleware}.py
    db/{base,session}.py
    db/models/dataset.py
    db/repositories/datasets.py
    ingestion/{types,exceptions,validators,readers,types}.py
    schemas/{common,datasets,health}.py
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

## Logging and errors

Every response carries `X-Request-ID`; a safe caller-provided value is preserved. Request completion logs include method, path, status, and duration but never query/body contents. JSON errors use:

```json
{ "error": { "code": "string", "message": "string", "details": { ... } | [ ... ] | null, "request_id": "string" } }
```
