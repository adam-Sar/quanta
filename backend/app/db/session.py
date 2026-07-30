"""SQLAlchemy engine, session lifecycle, and connectivity probe."""

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings


def build_database_engine(settings: Settings) -> Engine:
    """Build a bounded PostgreSQL connection pool from typed settings."""

    return create_engine(
        settings.database_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout_seconds,
    )


engine = build_database_engine(get_settings())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Provide one session per request and always release it back to the pool."""

    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database(session: Session) -> None:
    """Execute a minimal readiness query without reading application data."""

    session.execute(text("SELECT 1"))
