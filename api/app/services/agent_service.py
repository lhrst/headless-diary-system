"""Agent task creation and context-building service.

Does NOT contain any LLM call logic — that lives in the Celery tasks layer.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_task import AgentTask
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag
from app.utils.markdown import extract_references, extract_tags


async def create_agent_task(
    db: AsyncSession,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    command: str,
) -> AgentTask:
    """Create a pending agent task to be picked up by Celery."""

    task = AgentTask(
        entry_id=entry_id,
        user_id=user_id,
        command=command,
        status="pending",
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


_WEEK_KEYWORDS = re.compile(r"周报|本周|weekly|this\s*week", re.IGNORECASE)
_TAG_IN_CMD = re.compile(r"#([\w\u4e00-\u9fff]+)")
_REF_IN_CMD = re.compile(r"\[\[([^\]]+)\]\]")


async def build_context(
    db: AsyncSession,
    command: str,
    entry_id: uuid.UUID,
) -> str:
    """Build a context string for the LLM based on the agent command.

    Gathers:
    - The current diary entry content.
    - Related entries by #tag if tags are mentioned in the command.
    - Referenced entries via [[ref]] if present in the command.
    - This week's entries if the command mentions weekly/周报 keywords.
    """

    parts: list[str] = []

    # ── Current entry ─────────────────────────────────────────
    stmt = select(DiaryEntry).where(DiaryEntry.id == entry_id)
    result = await db.execute(stmt)
    current = result.scalar_one_or_none()

    if current and current.raw_text:
        parts.append(f"## 当前日记\n\n{current.raw_text}")

    # ── Tag-related entries ───────────────────────────────────
    cmd_tags = _TAG_IN_CMD.findall(command)
    if cmd_tags:
        tag_stmt = (
            select(DiaryEntry)
            .join(DiaryTag, DiaryTag.entry_id == DiaryEntry.id)
            .where(DiaryTag.tag.in_(cmd_tags))
            .where(DiaryEntry.id != entry_id)
            .order_by(DiaryEntry.created_at.desc())
            .limit(10)
        )
        tag_result = await db.execute(tag_stmt)
        tag_entries = tag_result.scalars().all()
        if tag_entries:
            lines = []
            for e in tag_entries:
                title = e.manual_title or e.auto_title or str(e.id)
                lines.append(f"### {title}\n\n{e.raw_text or ''}")
            parts.append("## 相关标签日记\n\n" + "\n\n---\n\n".join(lines))

    # ── Referenced entries ────────────────────────────────────
    cmd_refs = _REF_IN_CMD.findall(command)
    if cmd_refs:
        from app.services.reference_service import _is_uuid

        for ref in cmd_refs:
            if _is_uuid(ref):
                ref_stmt = select(DiaryEntry).where(DiaryEntry.id == uuid.UUID(ref))
            else:
                pattern = f"%{ref}%"
                ref_stmt = (
                    select(DiaryEntry)
                    .where(
                        (DiaryEntry.manual_title.ilike(pattern))
                        | (DiaryEntry.auto_title.ilike(pattern))
                    )
                    .limit(1)
                )
            ref_result = await db.execute(ref_stmt)
            ref_entry = ref_result.scalar_one_or_none()
            if ref_entry and ref_entry.raw_text:
                title = ref_entry.manual_title or ref_entry.auto_title or str(ref_entry.id)
                parts.append(f"## 引用日记: {title}\n\n{ref_entry.raw_text}")

    # ── Weekly entries ────────────────────────────────────────
    if _WEEK_KEYWORDS.search(command):
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        # Retrieve user_id from the current entry
        user_id = current.author_id if current else None
        if user_id:
            week_stmt = (
                select(DiaryEntry)
                .where(
                    DiaryEntry.author_id == user_id,
                    DiaryEntry.created_at >= week_start,
                )
                .order_by(DiaryEntry.created_at.asc())
            )
            week_result = await db.execute(week_stmt)
            week_entries = week_result.scalars().all()
            if week_entries:
                lines = []
                for e in week_entries:
                    title = e.manual_title or e.auto_title or str(e.id)
                    lines.append(f"### {title}\n\n{e.raw_text or ''}")
                parts.append("## 本周日记\n\n" + "\n\n---\n\n".join(lines))

    return "\n\n" + "\n\n".join(parts) if parts else ""
