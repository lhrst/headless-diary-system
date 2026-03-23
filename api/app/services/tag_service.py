"""Tag management service."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag


async def suggest_tags(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    limit: int = 8,
) -> list[dict]:
    """Suggest tags matching a prefix, ordered by usage count."""

    stmt = (
        select(DiaryTag.tag, func.count(DiaryTag.id).label("count"))
        .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
        .where(
            DiaryEntry.author_id == user_id,
            DiaryTag.tag.ilike(f"{query}%"),
        )
        .group_by(DiaryTag.tag)
        .order_by(func.count(DiaryTag.id).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [{"tag": row.tag, "count": row.count} for row in result.all()]


async def get_all_tags(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[dict]:
    """Return all tags for a user with usage counts."""

    stmt = (
        select(DiaryTag.tag, func.count(DiaryTag.id).label("count"))
        .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
        .where(DiaryEntry.author_id == user_id)
        .group_by(DiaryTag.tag)
        .order_by(func.count(DiaryTag.id).desc())
    )
    result = await db.execute(stmt)
    return [{"tag": row.tag, "count": row.count} for row in result.all()]


async def get_entries_by_tag(
    db: AsyncSession,
    user_id: uuid.UUID,
    tag: str,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[DiaryEntry], int]:
    """Return diary entries with a specific tag (paginated)."""

    base = (
        select(DiaryEntry)
        .join(DiaryTag, DiaryTag.entry_id == DiaryEntry.id)
        .where(DiaryEntry.author_id == user_id, DiaryTag.tag == tag)
    )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        base.order_by(DiaryEntry.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    entries = list(result.scalars().all())
    return entries, total


async def add_tags(
    db: AsyncSession,
    entry_id: uuid.UUID,
    tags: list[str],
) -> None:
    """Add tags to an entry (skips duplicates)."""

    # Fetch existing tags to avoid unique-constraint violations.
    stmt = select(DiaryTag.tag).where(DiaryTag.entry_id == entry_id)
    existing = set((await db.execute(stmt)).scalars().all())

    for tag in tags:
        if tag not in existing:
            db.add(DiaryTag(entry_id=entry_id, tag=tag))
            existing.add(tag)

    await db.flush()


async def sync_tags(
    db: AsyncSession,
    entry_id: uuid.UUID,
    tags: list[str],
) -> None:
    """Synchronise tags: remove old ones, add new ones."""

    # Delete all existing tags for this entry
    await db.execute(
        delete(DiaryTag).where(DiaryTag.entry_id == entry_id)
    )

    # Insert the current set
    for tag in dict.fromkeys(tags):  # deduplicate while preserving order
        db.add(DiaryTag(entry_id=entry_id, tag=tag))

    await db.flush()
