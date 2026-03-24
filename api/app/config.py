from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/diary"

    # ── Redis / Celery ────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production"
    JWT_ACCESS_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_EXPIRE_DAYS: int = 7

    # ── OpenRouter (LLM) ─────────────────────────────────────
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # ── Storage paths ─────────────────────────────────────────
    DIARY_STORAGE_PATH: str = "./data/diaries"
    MEDIA_STORAGE_PATH: str = "./data/media"

    # ── Media size limits (MB) ────────────────────────────────
    MEDIA_MAX_PHOTO_MB: int = 20
    MEDIA_MAX_VIDEO_MB: int = 500
    MEDIA_MAX_AUDIO_MB: int = 100

    # ── Whisper (speech-to-text) ──────────────────────────────
    WHISPER_MODEL_SIZE: str = "base"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_CLOUD_FALLBACK: bool = True

    # ── Agent ─────────────────────────────────────────────────
    AGENT_USER_ID: str = ""

    # ── Video processing ──────────────────────────────────────
    VIDEO_MAX_KEYFRAMES: int = 10

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }


settings = Settings()
