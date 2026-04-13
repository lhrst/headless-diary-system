"""Agent-posting endpoints for machine-to-machine clients.

External services (HappyClaw on the user's Mac, CI jobs, etc.) authenticate
with a bearer token matching settings.AGENT_SERVICE_TOKEN and are allowed to:

- POST /api/v1/agent-service/entry    — create a DiaryEntry authored by the
                                        built-in agent user
- POST /api/v1/agent-service/comment  — create a DiaryComment authored by the
                                        agent user, with optional threading
                                        (parent_comment_id)

The agent user's password_hash is "!nologin" so it can never log in via
/auth/login — this router is the only way to post as the agent.
"""

from __future__ import annotations

import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.service_auth import require_service_token
from app.models.comment import DiaryComment
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag
from app.schemas.comment import CommentResponse
from app.schemas.diary import DiaryDetail
from app.services.agent_user import AGENT_UUID, ensure_agent_user
from app.utils.file_storage import save_diary_file
from app.utils.markdown import extract_tags


router = APIRouter(
    prefix="/agent-service",
    tags=["agent-service"],
    dependencies=[Depends(require_service_token)],
)


class AgentEntryCreate(BaseModel):
    content: str = Field(..., min_length=1)
    manual_title: str | None = None
    extra_tags: list[str] | None = None


class AgentCommentCreate(BaseModel):
    entry_id: uuid.UUID
    content: str = Field(..., min_length=1)
    parent_comment_id: uuid.UUID | None = None


@router.post(
    "/entry",
    response_model=DiaryDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_entry_as_agent(
    body: AgentEntryCreate,
    db: AsyncSession = Depends(get_db),
):
    # Make sure the agent user row exists (idempotent).
    await ensure_agent_user(db)

    content_hash = hashlib.md5(body.content.encode()).hexdigest()
    entry = DiaryEntry(
        author_id=AGENT_UUID,
        manual_title=body.manual_title,
        raw_text=body.content,
        content_hash=content_hash,
        content_path="pending",
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    # Persist markdown to disk at the same path layout the normal flow uses.
    entry.content_path = save_diary_file(
        user_id=str(AGENT_UUID),
        entry_id=str(entry.id),
        content=body.content,
        base_path=settings.DIARY_STORAGE_PATH,
    )

    # Merge #inline-tags from content with any extra_tags the caller passed.
    inline_tags = {t.lower() for t in extract_tags(body.content)}
    extra_tags = {t.lower() for t in (body.extra_tags or [])}
    for tag_name in inline_tags | extra_tags:
        db.add(DiaryTag(entry_id=entry.id, tag=tag_name))

    await db.flush()
    await db.refresh(entry)

    all_tags = list(inline_tags | extra_tags)
    return DiaryDetail(
        id=entry.id,
        author=entry.author_id,
        title=entry.auto_title or entry.manual_title or "Untitled",
        title_source="auto" if entry.auto_title else ("manual" if entry.manual_title else "none"),
        content=entry.raw_text or "",
        tags=all_tags,
        ai_tags=[],
        references_out=[],
        backlinks=[],
        comments=[],
        agent_tasks=[],
        latitude=entry.latitude,
        longitude=entry.longitude,
        address=entry.address,
        weather=entry.weather,
        weather_icon=entry.weather_icon,
        temperature=entry.temperature,
        is_agent_marked=bool(entry.is_agent_marked),
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


@router.post(
    "/comment",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment_as_agent(
    body: AgentCommentCreate,
    db: AsyncSession = Depends(get_db),
):
    # Entry must exist.
    entry_result = await db.execute(
        select(DiaryEntry).where(DiaryEntry.id == body.entry_id)
    )
    entry = entry_result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found",
        )

    # Parent comment (if supplied) must belong to the same entry.
    if body.parent_comment_id is not None:
        parent_result = await db.execute(
            select(DiaryComment).where(DiaryComment.id == body.parent_comment_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None or parent.entry_id != body.entry_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent_comment_id",
            )

    await ensure_agent_user(db)

    comment = DiaryComment(
        entry_id=body.entry_id,
        author_id=AGENT_UUID,
        author_role="agent",
        parent_comment_id=body.parent_comment_id,
        content=body.content,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return comment
