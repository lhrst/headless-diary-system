"""Auth routes: register, login, refresh, me."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    verify_token,
)
from app.middleware.rate_limit import (
    client_ip,
    clear_auth_failures,
    enforce_rate_limit,
    is_locked_out,
    record_auth_failure,
)
from app.models.user import User
from app.schemas.user import (
    RefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_pwd_ctx = CryptContext(schemes=["bcrypt"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Hard-close when env flag is set (prod should default DISABLE_REGISTER=true).
    if settings.DISABLE_REGISTER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    # IP rate limit: stop automated signup floods.
    ip = client_ip(request)
    enforce_rate_limit(
        key=f"register:{ip}",
        limit=settings.AUTH_REGISTER_LIMIT_PER_MIN,
        window_seconds=60,
    )

    # Check for duplicate username / email
    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already taken",
        )

    user = User(
        username=body.username,
        email=body.email,
        password_hash=_pwd_ctx.hash(body.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip = client_ip(request)

    # IP-level rate limit first: blunt brute-force.
    enforce_rate_limit(
        key=f"login:{ip}",
        limit=settings.AUTH_LOGIN_LIMIT_PER_MIN,
        window_seconds=60,
    )

    # Username-scoped lockout second: after N consecutive failures for this
    # (ip, username) pair, block further attempts until the window expires.
    lockout_key = f"{ip}:{body.username}"
    if is_locked_out(lockout_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not _pwd_ctx.verify(body.password, user.password_hash):
        record_auth_failure(
            key=lockout_key,
            max_failures=settings.AUTH_MAX_LOGIN_FAILURES,
            window_seconds=settings.AUTH_LOCKOUT_SECONDS,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Successful login — clear failure history for this (ip, username).
    clear_auth_failures(lockout_key)

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = verify_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )

    # Verify user still exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
