from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables that don't exist yet (dev convenience; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
