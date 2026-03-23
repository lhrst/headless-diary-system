"""Comment routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.comment import DiaryComment
from app.models.diary import DiaryEntry
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentResponse

router = APIRouter(prefix="/diary", tags=["comments"])


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

    comment = DiaryComment(
        entry_id=entry_id,
        author_id=current_user.id,
        author_role=current_user.role,
        content=body.content,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
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
