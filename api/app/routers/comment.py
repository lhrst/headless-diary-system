"""Comment routes."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.agent_task import AgentTask
from app.models.comment import DiaryComment
from app.models.diary import DiaryEntry
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentResponse

router = APIRouter(prefix="/diary", tags=["comments"])

# Pattern: @agent followed by the command text
_AGENT_CMD_RE = re.compile(r"@agent\s+(.+)", re.DOTALL | re.IGNORECASE)

# Keywords that indicate an "improvement" (code-change) request
_IMPROVEMENT_KEYWORDS = re.compile(r"改进|改善|优化|添加功能|新增|修复|improve|add feature|fix", re.IGNORECASE)


def _classify_command(command: str) -> str:
    """Return 'improvement' or 'chat' based on command content."""
    if _IMPROVEMENT_KEYWORDS.search(command):
        return "improvement"
    return "chat"


@router.post(
    "/{entry_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    entry_id: uuid.UUID,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify entry exists
    result = await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found",
        )

    # Validate parent_comment_id if provided: must belong to the same entry.
    parent_comment = None
    if body.parent_comment_id is not None:
        parent_result = await db.execute(
            select(DiaryComment).where(DiaryComment.id == body.parent_comment_id)
        )
        parent_comment = parent_result.scalar_one_or_none()
        if parent_comment is None or parent_comment.entry_id != entry_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent_comment_id",
            )

    comment = DiaryComment(
        entry_id=entry_id,
        author_id=current_user.id,
        author_role=current_user.role,
        parent_comment_id=body.parent_comment_id,
        content=body.content,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)

    # Decide whether to trigger the agent:
    # 1. explicit @agent token in the content, OR
    # 2. implicit: this comment is a direct reply to an agent-authored comment
    agent_command: str | None = None
    match = _AGENT_CMD_RE.search(body.content)
    if match:
        agent_command = match.group(1).strip()
    elif parent_comment is not None and parent_comment.author_role == "agent":
        # Implicit trigger: treat the whole reply as the command.
        # This is what enables "reply-to-agent" threading to keep the conversation going.
        agent_command = body.content.strip()

    if agent_command:
        task_type = _classify_command(agent_command)
        task = AgentTask(
            entry_id=entry_id,
            user_id=current_user.id,
            command=agent_command,
            task_type=task_type,
            status="pending",
        )
        db.add(task)
        await db.flush()
        await db.refresh(task)

        # Mark entry as agent-marked
        entry.is_agent_marked = True

        # Dispatch to Celery
        try:
            from app.tasks.agent_tasks import run_agent
            run_agent.delay(str(task.id))
        except Exception:
            pass

    return comment


@router.get("/{entry_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    entry_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify entry exists
    result = await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found",
        )

    offset = (page - 1) * per_page
    query = (
        select(DiaryComment)
        .where(DiaryComment.entry_id == entry_id)
        .order_by(DiaryComment.created_at.asc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(query)
    comments = result.scalars().all()
    return comments
