"""Simple Redis-backed rate limiting + account lockout for auth endpoints.

Uses a fixed-window counter keyed by IP or IP+username. No new dependencies —
reuses the existing redis package already in pyproject.toml.
"""

from __future__ import annotations

import time
from typing import Optional

import redis as redis_lib
from fastapi import HTTPException, Request, status

from app.config import settings


_client: Optional[redis_lib.Redis] = None


def _redis() -> redis_lib.Redis:
    """Lazily construct a shared Redis client."""
    global _client
    if _client is None:
        _client = redis_lib.Redis.from_url(
            settings.REDIS_URL, decode_responses=True, socket_timeout=2
        )
    return _client


def client_ip(request: Request) -> str:
    """Extract the real client IP, honoring X-Forwarded-For when present."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Raise 429 if `key` has exceeded `limit` requests in `window_seconds`.

    Uses a fixed-window counter. Safe to degrade: if Redis is unreachable, the
    call is a no-op so auth still works.
    """
    try:
        r = _redis()
        bucket_key = f"rl:{key}:{int(time.time()) // window_seconds}"
        count = r.incr(bucket_key)
        if count == 1:
            r.expire(bucket_key, window_seconds)
        if count > limit:
            retry_after = window_seconds - (int(time.time()) % window_seconds)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )
    except HTTPException:
        raise
    except Exception:
        # Redis down — fail open for availability. Nginx layer still protects.
        return


def is_locked_out(key: str) -> bool:
    """Return True if `key` is currently locked out due to failed auth."""
    try:
        return bool(_redis().exists(f"lockout:{key}"))
    except Exception:
        return False


def record_auth_failure(
    key: str,
    max_failures: int = 5,
    window_seconds: int = 900,
) -> int:
    """Record an auth failure for `key`. When failures reach `max_failures`,
    lock the key for `window_seconds`. Returns the current failure count.
    """
    try:
        r = _redis()
        fail_key = f"fail:{key}"
        count = int(r.incr(fail_key))
        if count == 1:
            r.expire(fail_key, window_seconds)
        if count >= max_failures:
            r.set(f"lockout:{key}", "1", ex=window_seconds)
        return count
    except Exception:
        return 0


def clear_auth_failures(key: str) -> None:
    """Clear failure count and lockout for `key` after a successful auth."""
    try:
        r = _redis()
        r.delete(f"fail:{key}", f"lockout:{key}")
    except Exception:
        pass
