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
    LLM_MODEL_FAST: str = "deepseek/deepseek-chat"
    LLM_MODEL_SMART: str = "deepseek/deepseek-chat"

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

    # ── Auth hardening ────────────────────────────────────────
    # When true, /auth/register returns 404 (closed to new signups).
    DISABLE_REGISTER: bool = False
    # Rate limits per IP per minute for auth endpoints.
    AUTH_LOGIN_LIMIT_PER_MIN: int = 5
    AUTH_REGISTER_LIMIT_PER_MIN: int = 3
    # After N consecutive failed logins (per IP+username), lock out for N seconds.
    AUTH_MAX_LOGIN_FAILURES: int = 5
    AUTH_LOCKOUT_SECONDS: int = 900

    # ── Agent service token ───────────────────────────────────
    # Bearer token allowing external services (e.g. HappyClaw running on the
    # user's Mac) to post DiaryEntries / DiaryComments AS the built-in agent
    # user. The agent user's password_hash is "!nologin", so normal /auth/login
    # doesn't work — this token is the only way in. Keep it long and random;
    # rotate by simply changing this env var.
    AGENT_SERVICE_TOKEN: str = ""

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }


settings = Settings()
