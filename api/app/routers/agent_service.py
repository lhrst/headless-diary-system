"""Agent-posting endpoints for machine-to-machine clients.

External services (HappyClaw on the user's Mac, CI jobs, etc.) authenticate
with a bearer token matching settings.AGENT_SERVICE_TOKEN and are allowed to:

- POST /api/v1/agent-service/entry            — create a DiaryEntry authored
                                                 by the built-in agent user
- POST /api/v1/agent-service/comment          — create a DiaryComment authored
                                                 by the agent user, with
                                                 optional threading
                                                 (parent_comment_id)
- POST /api/v1/agent-service/claim-tasks      — atomically claim N pending
                                                 chat-type AgentTasks, mark
                                                 them running, return payload
                                                 with full diary context for
                                                 HappyClaw to answer
- POST /api/v1/agent-service/task/{id}/result — submit the agent's answer,
                                                 auto-creates a comment and
                                                 marks the task done
- POST /api/v1/agent-service/task/{id}/fail   — mark task failed with error

The agent user's password_hash is "!nologin" so it can never log in via
/auth/login — this router is the only way to post as the agent.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.service_auth import require_service_token
from app.models.agent_task import AgentTask
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


# ── Task claim / result / fail (HappyClaw polling protocol) ──

class ClaimTasksRequest(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)


class ClaimedTask(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    command: str
    entry_title: str
    entry_content: str
    entry_created_at: datetime
    additional_context: str


class ClaimTasksResponse(BaseModel):
    tasks: list[ClaimedTask]


class PendingCountResponse(BaseModel):
    count: int


@router.get("/pending-count", response_model=PendingCountResponse)
async def pending_count(db: AsyncSession = Depends(get_db)):
    """Count pending chat-type agent tasks without touching state.

    HappyClaw's script-mode poller hits this every minute — a pure COUNT(*)
    is cheap enough that idle polling has zero measurable overhead. When the
    count is positive the poller injects a wake-up message into the main
    container, which does the real atomic claim via /claim-tasks.
    """
    from sqlalchemy import func

    result = await db.execute(
        select(func.count())
        .select_from(AgentTask)
        .where(
            AgentTask.status == "pending",
            AgentTask.task_type == "chat",
        )
    )
    return PendingCountResponse(count=int(result.scalar() or 0))


async def _build_task_context(
    db: AsyncSession, entry: DiaryEntry, command: str
) -> str:
    """Build supplementary context for an @agent command.

    Inspects the command for tag mentions (#xxx), diary references ([[uuid]]),
    and weekly keywords, then fetches the relevant extra entries so HappyClaw
    has everything it needs without re-querying.
    """
    parts: list[str] = []

    # Full comment thread on this entry — critical context, because @agent
    # commands are usually written as a new comment that references earlier
    # comments ("调研这几个渠道" → the channels were listed in prior comments,
    # not in the main entry body).
    comments_result = await db.execute(
        select(DiaryComment)
        .where(DiaryComment.entry_id == entry.id)
        .order_by(DiaryComment.created_at.asc())
        .limit(50)
    )
    all_comments = comments_result.scalars().all()
    if all_comments:
        parts.append("\nComment thread on this entry (chronological):")
        for c in all_comments:
            role_label = "agent" if c.author_role == "agent" else "user"
            ts = c.created_at.strftime("%Y-%m-%d %H:%M")
            snippet = (c.content or "")[:800]
            parts.append(f"---\n[{role_label} @ {ts}]\n{snippet}")

    # Tag mention → recent entries with that tag.
    tag_match = re.search(r"#([\w\u4e00-\u9fff]+)", command)
    if tag_match:
        tag = tag_match.group(1).lower()
        result = await db.execute(
            select(DiaryEntry)
            .join(DiaryTag, DiaryTag.entry_id == DiaryEntry.id)
            .where(
                DiaryTag.tag == tag,
                DiaryEntry.author_id == entry.author_id,
            )
            .order_by(DiaryEntry.created_at.desc())
            .limit(10)
        )
        tag_entries = result.scalars().all()
        if tag_entries:
            parts.append(f"\nRecent entries tagged #{tag}:")
            for e in tag_entries:
                title = e.manual_title or e.auto_title or ""
                parts.append(
                    f"---\n[{title}] ({e.created_at.date()})\n"
                    f"{(e.raw_text or '')[:500]}"
                )

    # [[uuid]] references.
    for ref in re.findall(r"\[\[([^\]]+)\]\]", command):
        try:
            ref_uuid = uuid.UUID(ref.split("|")[0])
        except ValueError:
            continue
        result = await db.execute(
            select(DiaryEntry).where(DiaryEntry.id == ref_uuid)
        )
        ref_entry = result.scalar_one_or_none()
        if ref_entry:
            title = ref_entry.manual_title or ref_entry.auto_title or ""
            parts.append(
                f"\nReferenced diary [{title}]:\n{(ref_entry.raw_text or '')[:1000]}"
            )

    # Weekly summary keywords.
    if any(kw in command for kw in ["周报", "本周", "这周", "weekly"]):
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=now.weekday())
        result = await db.execute(
            select(DiaryEntry)
            .where(
                DiaryEntry.author_id == entry.author_id,
                DiaryEntry.created_at >= week_start,
            )
            .order_by(DiaryEntry.created_at.desc())
        )
        week_entries = result.scalars().all()
        if week_entries:
            parts.append(
                f"\nThis week's entries ({len(week_entries)} total):"
            )
            for e in week_entries:
                title = e.manual_title or e.auto_title or ""
                parts.append(
                    f"- [{title}] ({e.created_at.date()}): "
                    f"{(e.raw_text or '')[:200]}..."
                )

    return "\n".join(parts)


@router.post("/claim-tasks", response_model=ClaimTasksResponse)
async def claim_tasks(
    body: ClaimTasksRequest,
    db: AsyncSession = Depends(get_db),
):
    """Atomically claim pending chat-type agent tasks.

    Uses `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent pollers never
    grab the same row. Marks each claimed row as 'running' before returning.
    """
    result = await db.execute(
        select(AgentTask)
        .where(
            AgentTask.status == "pending",
            AgentTask.task_type == "chat",
        )
        .order_by(AgentTask.created_at.asc())
        .limit(body.limit)
        .with_for_update(skip_locked=True)
    )
    tasks = result.scalars().all()

    claimed: list[ClaimedTask] = []
    for task in tasks:
        task.status = "running"

        entry_result = await db.execute(
            select(DiaryEntry).where(DiaryEntry.id == task.entry_id)
        )
        entry = entry_result.scalar_one_or_none()
        if entry is None:
            task.status = "failed"
            task.error = "diary entry not found"
            task.completed_at = datetime.now(timezone.utc)
            continue

        additional_context = await _build_task_context(db, entry, task.command)

        claimed.append(
            ClaimedTask(
                id=task.id,
                entry_id=task.entry_id,
                command=task.command,
                entry_title=(
                    entry.manual_title or entry.auto_title or "Untitled"
                ),
                entry_content=entry.raw_text or "",
                entry_created_at=entry.created_at,
                additional_context=additional_context,
            )
        )

    await db.commit()
    return ClaimTasksResponse(tasks=claimed)


class TaskResultRequest(BaseModel):
    content: str = Field(..., min_length=1)
    metadata: dict | None = None
    parent_comment_id: uuid.UUID | None = None


class TaskFailRequest(BaseModel):
    error: str = Field(..., min_length=1)


async def _get_running_task_or_404(
    db: AsyncSession, task_id: uuid.UUID
) -> AgentTask:
    result = await db.execute(
        select(AgentTask).where(AgentTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    if task.status not in ("running", "pending"):
        # Idempotent-ish: allow submitting result for a task we claimed
        # earlier even if something weird happened to its status.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Task already in terminal status: {task.status}",
        )
    return task


@router.post(
    "/task/{task_id}/result",
    response_model=CommentResponse,
)
async def submit_task_result(
    task_id: uuid.UUID,
    body: TaskResultRequest,
    db: AsyncSession = Depends(get_db),
):
    """HappyClaw posts the final answer for a claimed task.

    Creates the agent comment, links it to the task, and marks the task done.
    """
    task = await _get_running_task_or_404(db, task_id)
    await ensure_agent_user(db)

    comment = DiaryComment(
        entry_id=task.entry_id,
        author_id=AGENT_UUID,
        author_role="agent",
        parent_comment_id=body.parent_comment_id,
        content=body.content,
        metadata_={
            "task_id": str(task.id),
            "source": "happyclaw",
            **(body.metadata or {}),
        },
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)

    task.status = "done"
    task.result = body.content
    task.result_comment_id = comment.id
    task.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.post(
    "/task/{task_id}/fail",
    status_code=status.HTTP_200_OK,
)
async def fail_task(
    task_id: uuid.UUID,
    body: TaskFailRequest,
    db: AsyncSession = Depends(get_db),
):
    """HappyClaw reports that a claimed task could not be answered."""
    task = await _get_running_task_or_404(db, task_id)
    await ensure_agent_user(db)

    comment = DiaryComment(
        entry_id=task.entry_id,
        author_id=AGENT_UUID,
        author_role="agent",
        content=f"任务执行失败：{body.error[:500]}",
        metadata_={"task_id": str(task.id), "source": "happyclaw"},
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)

    task.status = "failed"
    task.error = body.error
    task.result_comment_id = comment.id
    task.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
