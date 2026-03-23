"""Core diary CRUD service."""

from __future__ import annotations

import hashlib
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.diary import DiaryEntry
from app.services import reference_service, tag_service, agent_service
from app.utils.file_storage import delete_diary_file, save_diary_file
from app.utils.markdown import extract_agent_commands, extract_references, extract_tags


def _content_hash(content: str) -> str:
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def _hash_similarity(old_hash: str | None, new_hash: str) -> float:
    """Return a rough similarity ratio between two MD5 hex digests (0.0-1.0).

    This is a simple character-level comparison; it is only used as a cheap
    heuristic to decide whether the content changed significantly.
    """
    if old_hash is None:
        return 0.0
    matches = sum(a == b for a, b in zip(old_hash, new_hash))
    return matches / max(len(old_hash), len(new_hash))


# ── Public API ───────────────────────────────────────────────────────


async def create_diary(
    db: AsyncSession,
    user_id: uuid.UUID,
    content: str,
    manual_title: str | None = None,
) -> DiaryEntry:
    """Create a new diary entry with tags, references, and agent tasks."""

    entry_id = uuid.uuid4()
    content_path = save_diary_file(
        user_id=str(user_id),
        entry_id=str(entry_id),
        content=content,
        base_path=settings.DIARY_STORAGE_PATH,
    )

    entry = DiaryEntry(
        id=entry_id,
        author_id=user_id,
        manual_title=manual_title,
        content_path=content_path,
        raw_text=content,
        content_hash=_content_hash(content),
    )
    db.add(entry)
    await db.flush()

    # ── Tags ──────────────────────────────────────────────────
    tags = extract_tags(content)
    if tags:
        await tag_service.add_tags(db, entry.id, tags)

    # ── References ────────────────────────────────────────────
    refs = extract_references(content)
    if refs:
        await reference_service.resolve_references(db, entry.id, refs)

    # ── Agent commands ────────────────────────────────────────
    commands = extract_agent_commands(content)
    for cmd in commands:
        await agent_service.create_agent_task(db, entry.id, user_id, cmd)
    if commands:
        entry.is_agent_marked = True

    await db.flush()
    await db.refresh(entry)
    return entry


async def update_diary(
    db: AsyncSession,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    content: str,
    manual_title: str | None = None,
) -> DiaryEntry:
    """Update an existing diary entry."""

    entry = await get_diary(db, entry_id, user_id)
    if entry is None:
        raise ValueError("Diary entry not found")

    old_hash = entry.content_hash
    new_hash = _content_hash(content)

    # Persist updated file
    save_diary_file(
        user_id=str(user_id),
        entry_id=str(entry_id),
        content=content,
        base_path=settings.DIARY_STORAGE_PATH,
    )

    entry.raw_text = content
    entry.content_hash = new_hash
    if manual_title is not None:
        entry.manual_title = manual_title

    # If content changed significantly (>30% hash difference), clear auto
    # title so the background job regenerates it.
    if _hash_similarity(old_hash, new_hash) < 0.70:
        entry.auto_title = None

    # ── Re-sync tags ──────────────────────────────────────────
    tags = extract_tags(content)
    await tag_service.sync_tags(db, entry.id, tags)

    # ── Re-sync references ────────────────────────────────────
    from app.models.reference import DiaryReference

    await db.execute(
        delete(DiaryReference).where(DiaryReference.source_id == entry.id)
    )
    refs = extract_references(content)
    if refs:
        await reference_service.resolve_references(db, entry.id, refs)

    # ── Re-sync agent commands ────────────────────────────────
    commands = extract_agent_commands(content)
    for cmd in commands:
        await agent_service.create_agent_task(db, entry.id, user_id, cmd)
    entry.is_agent_marked = bool(commands)

    await db.flush()
    await db.refresh(entry)
    return entry


async def get_diary(
    db: AsyncSession,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
) -> DiaryEntry | None:
    """Get a single diary entry owned by user_id."""

    stmt = select(DiaryEntry).where(
        DiaryEntry.id == entry_id,
        DiaryEntry.author_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_diaries(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    per_page: int = 20,
    tag: str | None = None,
    q: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort: str = "newest",
) -> tuple[list[DiaryEntry], int]:
    """List diary entries with filtering, search, and pagination.

    Returns ``(entries, total_count)``.
    """

    from app.models.tag import DiaryTag

    base = select(DiaryEntry).where(DiaryEntry.author_id == user_id)

    if tag:
        base = base.join(DiaryTag).where(DiaryTag.tag == tag)

    if q:
        base = base.where(DiaryEntry.raw_text.ilike(f"%{q}%"))

    if start_date:
        base = base.where(DiaryEntry.created_at >= start_date)

    if end_date:
        base = base.where(DiaryEntry.created_at <= end_date)

    # ── Total count ───────────────────────────────────────────
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # ── Ordering ──────────────────────────────────────────────
    if sort == "oldest":
        base = base.order_by(DiaryEntry.created_at.asc())
    else:
        base = base.order_by(DiaryEntry.created_at.desc())

    # ── Pagination ────────────────────────────────────────────
    offset = (page - 1) * per_page
    base = base.offset(offset).limit(per_page)

    result = await db.execute(base)
    entries = list(result.scalars().all())
    return entries, total


async def delete_diary(
    db: AsyncSession,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Delete a diary entry and its .md file."""

    entry = await get_diary(db, entry_id, user_id)
    if entry is None:
        raise ValueError("Diary entry not found")

    delete_diary_file(entry.content_path, settings.DIARY_STORAGE_PATH)
    await db.delete(entry)
    await db.flush()
