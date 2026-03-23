"""Diary cross-reference (wiki-link) service."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.diary import DiaryEntry
from app.models.reference import DiaryReference


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


async def resolve_references(
    db: AsyncSession,
    entry_id: uuid.UUID,
    ref_strings: list[str],
) -> None:
    """Resolve ``[[ref]]`` strings and create diary_references records.

    For each reference string:
    - If it looks like a UUID, look up the target entry directly.
    - Otherwise, do a fuzzy title search (manual_title or auto_title).

    Self-references and duplicates are silently skipped.
    """

    seen_targets: set[uuid.UUID] = set()

    for ref in ref_strings:
        target: DiaryEntry | None = None

        if _is_uuid(ref):
            stmt = select(DiaryEntry).where(DiaryEntry.id == uuid.UUID(ref))
            result = await db.execute(stmt)
            target = result.scalar_one_or_none()
        else:
            # Fuzzy search by title (prefer manual_title, fall back to auto_title)
            pattern = f"%{ref}%"
            stmt = (
                select(DiaryEntry)
                .where(
                    (DiaryEntry.manual_title.ilike(pattern))
                    | (DiaryEntry.auto_title.ilike(pattern))
                )
                .limit(1)
            )
            result = await db.execute(stmt)
            target = result.scalar_one_or_none()

        if target is None:
            continue
        if target.id == entry_id:
            continue
        if target.id in seen_targets:
            continue

        seen_targets.add(target.id)
        db.add(DiaryReference(source_id=entry_id, target_id=target.id))

    await db.flush()


async def get_references(
    db: AsyncSession,
    entry_id: uuid.UUID,
) -> list[DiaryEntry]:
    """Get all entries that *this* entry references (outgoing links)."""

    stmt = (
        select(DiaryEntry)
        .join(DiaryReference, DiaryReference.target_id == DiaryEntry.id)
        .where(DiaryReference.source_id == entry_id)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_backlinks(
    db: AsyncSession,
    entry_id: uuid.UUID,
) -> list[DiaryEntry]:
    """Get all entries that reference *this* entry (incoming links)."""

    stmt = (
        select(DiaryEntry)
        .join(DiaryReference, DiaryReference.source_id == DiaryEntry.id)
        .where(DiaryReference.target_id == entry_id)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
