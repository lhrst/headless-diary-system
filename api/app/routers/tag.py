"""Tag routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag
from app.models.user import User
from app.schemas.diary import DiaryBrief
from app.schemas.tag import TagListResponse, TagSuggestItem, TagSuggestResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=TagListResponse)
async def list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all tags with usage counts for the current user."""
    query = (
        select(DiaryTag.tag, func.count(DiaryTag.id).label("count"))
        .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
        .where(DiaryEntry.author_id == current_user.id)
        .group_by(DiaryTag.tag)
        .order_by(func.count(DiaryTag.id).desc())
    )
    result = await db.execute(query)
    rows = result.all()

    return TagListResponse(
        tags=[TagSuggestItem(tag=row.tag, count=row.count) for row in rows]
    )


@router.get("/suggest", response_model=TagSuggestResponse)
async def suggest_tags(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-complete tags matching query prefix."""
    like_expr = f"{q}%"
    query = (
        select(DiaryTag.tag, func.count(DiaryTag.id).label("count"))
        .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
        .where(
            DiaryEntry.author_id == current_user.id,
            DiaryTag.tag.ilike(like_expr),
        )
        .group_by(DiaryTag.tag)
        .order_by(func.count(DiaryTag.id).desc())
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    return TagSuggestResponse(
        suggestions=[TagSuggestItem(tag=row.tag, count=row.count) for row in rows]
    )


@router.get("/{tag}/entries", response_model=list[DiaryBrief])
async def entries_by_tag(
    tag: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return diary entries that have the given tag."""
    query = (
        select(DiaryEntry)
        .options(selectinload(DiaryEntry.tags))
        .join(DiaryTag, DiaryTag.entry_id == DiaryEntry.id)
        .where(
            DiaryEntry.author_id == current_user.id,
            DiaryTag.tag == tag,
        )
        .order_by(DiaryEntry.created_at.desc())
    )
    result = await db.execute(query)
    entries = result.scalars().all()

    return [
        DiaryBrief(
            id=e.id,
            title=e.manual_title or e.auto_title or "Untitled",
            title_source="manual" if e.manual_title else ("auto" if e.auto_title else "none"),
            tags=[t.tag for t in e.tags],
            preview=(e.raw_text or "")[:120],
            created_at=e.created_at,
            updated_at=e.updated_at,
        )
        for e in entries
    ]
