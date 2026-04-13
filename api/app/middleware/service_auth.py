"""Service-token authentication for machine-to-machine calls.

Used by the agent posting endpoints: an external service (HappyClaw on the
user's Mac) presents a bearer token matching settings.AGENT_SERVICE_TOKEN and
is allowed to create DiaryEntries / DiaryComments on behalf of the built-in
agent user.

Intentionally separate from the normal JWT middleware so:
- The auth flow is distinct in audit logs.
- Revocation is instant (change env var + restart).
- The agent user keeps its '!nologin' password_hash unchanged.
"""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import settings


def require_service_token(
    authorization: str | None = Header(default=None),
) -> None:
    """Validate the bearer token in the Authorization header.

    Rejects when the server has no service token configured (empty env var),
    so a mistake in deployment fails closed rather than allowing any token.
    """
    expected = settings.AGENT_SERVICE_TOKEN
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent service token not configured",
        )

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Constant-time comparison prevents timing attacks.
    if not hmac.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token",
            headers={"WWW-Authenticate": "Bearer"},
        )
