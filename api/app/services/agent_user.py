"""Ensure the built-in AI Agent user exists.

The Agent user is a system-level account used to post comments on behalf of
the AI assistant.  It is created automatically on first startup.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User

# Fixed UUID so that it is stable across restarts and can be referenced in config
AGENT_UUID = uuid.UUID("00000000-0000-0000-0000-000000000001")
AGENT_USERNAME = "ai-agent"
AGENT_EMAIL = "agent@diary.local"
AGENT_DISPLAY_NAME = "AI 助手"
AGENT_ROLE = "agent"


async def ensure_agent_user(db: AsyncSession) -> User:
    """Return the Agent user, creating it if it does not exist."""

    result = await db.execute(select(User).where(User.id == AGENT_UUID))
    agent = result.scalar_one_or_none()

    if agent is None:
        agent = User(
            id=AGENT_UUID,
            username=AGENT_USERNAME,
            email=AGENT_EMAIL,
            password_hash="!nologin",  # not a valid bcrypt hash → can never log in
            display_name=AGENT_DISPLAY_NAME,
            role=AGENT_ROLE,
        )
        db.add(agent)
        await db.flush()
        await db.refresh(agent)

        # Persist the ID in settings so Celery workers can use it
        if not settings.AGENT_USER_ID:
            settings.AGENT_USER_ID = str(AGENT_UUID)

    else:
        # Update display name / role if they drifted
        if agent.role != AGENT_ROLE:
            agent.role = AGENT_ROLE
        if agent.display_name != AGENT_DISPLAY_NAME:
            agent.display_name = AGENT_DISPLAY_NAME

    # Always make sure settings has the correct ID
    settings.AGENT_USER_ID = str(AGENT_UUID)
    return agent


def get_agent_user_id() -> uuid.UUID:
    """Return the Agent user UUID (no DB required)."""
    return AGENT_UUID
