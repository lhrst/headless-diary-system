import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine, async_session_factory
from app.services.agent_user import ensure_agent_user

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    # Retry DB connection up to 10 times (handles Docker startup race)
    for attempt in range(10):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            break
        except Exception as e:
            logger.warning("DB connect attempt %d/10 failed: %s", attempt + 1, e)
            if attempt == 9:
                raise
            await asyncio.sleep(2)

    # Ensure the built-in Agent user exists
    async with async_session_factory() as session:
        agent = await ensure_agent_user(session)
        await session.commit()
        logger.info("Agent user ready: %s (id=%s)", agent.username, agent.id)

    yield


app = FastAPI(
    title="Headless Diary System",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS (allow everything for local development) ────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["ops"])
async def health_check():
    return {"status": "ok"}


# ── Routers ───────────────────────────────────────────────────
from app.routers import auth, diary, tag, comment, agent, media  # noqa: E402

app.include_router(auth.router, prefix="/api/v1")
app.include_router(diary.router, prefix="/api/v1")
app.include_router(tag.router, prefix="/api/v1")
app.include_router(comment.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
