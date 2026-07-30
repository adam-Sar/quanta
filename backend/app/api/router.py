"""Top-level API router composition."""

from fastapi import APIRouter

from app.api.routes.datasets import router as datasets_router
from app.api.routes.health import router as health_router
from app.api.routes.profiles import router as profiles_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(datasets_router)
api_router.include_router(profiles_router)
