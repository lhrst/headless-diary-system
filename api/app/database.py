from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Async engine (for FastAPI)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Sync engine (for Celery workers) — lazy init to avoid import-time connection
_sync_engine = None
_sync_session = None


def sync_session_factory():
    global _sync_engine, _sync_session
    if _sync_session is None:
        _sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")
        _sync_engine = create_engine(_sync_url, echo=False, pool_pre_ping=True)
        _sync_session = sessionmaker(_sync_engine, expire_on_commit=False)
    return _sync_session()


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
