"""FastAPI application factory and ASGI entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import request_context_middleware
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Release pooled database connections during graceful shutdown."""

    del app
    yield
    engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build an application instance suitable for production and isolated tests."""

    runtime_settings = settings or get_settings()
    configure_logging(runtime_settings)

    application = FastAPI(
        title=runtime_settings.app_name,
        version=runtime_settings.app_version,
        description=(
            "Backend API for deterministic data reliability analysis and safe, "
            "AI-assisted interpretation. Task 2 adds dataset ingestion; Task 3 "
            "adds deterministic dataset profiling over the original file. "
            "Quality detection, scoring, history, AI, recommendations, and "
            "validation are introduced in later tasks."
        ),
        debug=runtime_settings.debug,
        lifespan=lifespan,
    )
    application.state.settings = runtime_settings
    if settings is not None:
        application.dependency_overrides[get_settings] = lambda: runtime_settings

    runtime_settings.storage_path.mkdir(parents=True, exist_ok=True)
    register_exception_handlers(application)
    application.middleware("http")(request_context_middleware)
    application.include_router(api_router)
    return application


app = create_app()