"""Diary CRUD routes."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.diary import DiaryEntry
from app.models.reference import DiaryReference
from app.models.tag import DiaryTag
from app.models.user import User
from app.schemas.diary import (
    DiaryBrief,
    DiaryCreate,
    DiaryDetail,
    DiaryListResponse,
    DiaryUpdate,
    DiarySuggestItem,
    DiarySuggestResponse,
    ReferenceInfo,
)
from app.utils.file_storage import delete_diary_file, read_diary_file, save_diary_file
from app.utils.markdown import extract_tags, extract_references, extract_agent_commands

router = APIRouter(prefix="/diary", tags=["diary"])


# ── helpers ──────────────────────────────────────────────────────

def _entry_title(entry: DiaryEntry) -> str:
    return entry.manual_title or entry.auto_title or "Untitled"


def _entry_title_source(entry: DiaryEntry) -> str:
    if entry.manual_title:
        return "manual"
    if entry.auto_title:
        return "auto"
    return "none"


def _entry_to_brief(entry: DiaryEntry) -> DiaryBrief:
    preview = (entry.raw_text or "")[:120]
    return DiaryBrief(
        id=entry.id,
        title=_entry_title(entry),
        title_source=_entry_title_source(entry),
        tags=[t.tag for t in entry.tags],
        preview=preview,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _ref_info(entry: DiaryEntry) -> ReferenceInfo:
    return ReferenceInfo(
        id=entry.id,
        title=_entry_title(entry),
        date=entry.created_at.strftime("%Y-%m-%d"),
    )


def _entry_to_detail(entry: DiaryEntry, content: str) -> DiaryDetail:
    return DiaryDetail(
        id=entry.id,
        author=entry.author_id,
        title=_entry_title(entry),
        title_source=_entry_title_source(entry),
        content=content,
        tags=[t.tag for t in entry.tags],
        references_out=[
            _ref_info(ref.target) for ref in entry.references_out
        ],
        backlinks=[
            _ref_info(ref.source) for ref in entry.backlinks
        ],
        comments=[
            {
                "id": str(c.id),
                "author": str(c.author_id),
                "author_role": c.author_role,
                "content": c.content,
                "created_at": c.created_at.isoformat(),
            }
            for c in entry.comments
        ],
        agent_tasks=[
            {
                "id": str(t.id),
                "command": t.command,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
            }
            for t in entry.agent_tasks
        ],
        is_agent_marked=entry.is_agent_marked,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


async def _get_entry_or_404(
    entry_id: uuid.UUID,
    db: AsyncSession,
) -> DiaryEntry:
    result = await db.execute(
        select(DiaryEntry)
        .options(
            selectinload(DiaryEntry.tags),
            selectinload(DiaryEntry.references_out).selectinload(DiaryReference.target),
            selectinload(DiaryEntry.backlinks).selectinload(DiaryReference.source),
            selectinload(DiaryEntry.comments),
            selectinload(DiaryEntry.agent_tasks),
        )
        .where(DiaryEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diary entry not found")
    return entry


# ── routes ───────────────────────────────────────────────────────

@router.post("", response_model=DiaryDetail, status_code=status.HTTP_201_CREATED)
async def create_diary(
    body: DiaryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import hashlib
    content_hash = hashlib.md5(body.content.encode()).hexdigest()

    entry = DiaryEntry(
        author_id=current_user.id,
        manual_title=body.manual_title,
        raw_text=body.content,
        content_hash=content_hash,
        content_path="pending",  # Will be updated after flush
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    # Persist markdown to filesystem
    content_path = save_diary_file(
        user_id=str(current_user.id),
        entry_id=str(entry.id),
        content=body.content,
        base_path=settings.DIARY_STORAGE_PATH,
    )
    entry.content_path = content_path

    # Parse and sync tags
    tags = extract_tags(body.content)
    for tag_name in tags:
        db.add(DiaryTag(entry_id=entry.id, tag=tag_name.lower()))

    # Parse @agent commands → create agent tasks
    from app.models.agent_task import AgentTask
    agent_cmds = extract_agent_commands(body.content)
    for cmd in agent_cmds:
        task = AgentTask(entry_id=entry.id, user_id=current_user.id, command=cmd)
        db.add(task)

    await db.flush()
    await db.refresh(entry, attribute_names=["tags", "references_out", "backlinks", "comments", "agent_tasks"])

    # Dispatch agent tasks and auto-title asynchronously
    try:
        from app.tasks.title_tasks import generate_auto_title
        generate_auto_title.delay(str(entry.id))
        from app.tasks.agent_tasks import run_agent
        for task in entry.agent_tasks:
            run_agent.delay(str(task.id))
    except Exception:
        pass  # Celery may not be available in dev

    return _entry_to_detail(entry, body.content)


@router.get("", response_model=DiaryListResponse)
async def list_diaries(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tag: str | None = None,
    q: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(DiaryEntry)
        .options(selectinload(DiaryEntry.tags))
        .where(DiaryEntry.author_id == current_user.id)
    )
    count_query = (
        select(func.count())
        .select_from(DiaryEntry)
        .where(DiaryEntry.author_id == current_user.id)
    )

    # Filters
    if tag:
        query = query.join(DiaryTag).where(DiaryTag.tag == tag)
        count_query = count_query.join(DiaryTag).where(DiaryTag.tag == tag)
    if q:
        like_expr = f"%{q}%"
        query = query.where(DiaryEntry.raw_text.ilike(like_expr))
        count_query = count_query.where(DiaryEntry.raw_text.ilike(like_expr))
    if start_date:
        query = query.where(func.date(DiaryEntry.created_at) >= start_date)
        count_query = count_query.where(func.date(DiaryEntry.created_at) >= start_date)
    if end_date:
        query = query.where(func.date(DiaryEntry.created_at) <= end_date)
        count_query = count_query.where(func.date(DiaryEntry.created_at) <= end_date)

    # Sort
    order_col = DiaryEntry.created_at.desc() if sort == "desc" else DiaryEntry.created_at.asc()
    query = query.order_by(order_col)

    # Pagination
    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query)
    entries = result.scalars().all()

    return DiaryListResponse(
        items=[_entry_to_brief(e) for e in entries],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/suggest", response_model=DiarySuggestResponse)
async def suggest_diary(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    like_expr = f"%{q}%"
    query = (
        select(DiaryEntry)
        .where(
            DiaryEntry.author_id == current_user.id,
            (DiaryEntry.manual_title.ilike(like_expr))
            | (DiaryEntry.auto_title.ilike(like_expr)),
        )
        .order_by(DiaryEntry.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    entries = result.scalars().all()

    return DiarySuggestResponse(
        suggestions=[
            DiarySuggestItem(
                id=e.id,
                title=_entry_title(e),
                date=e.created_at.strftime("%Y-%m-%d"),
                preview=(e.raw_text or "")[:80],
            )
            for e in entries
        ]
    )


@router.get("/{entry_id}", response_model=DiaryDetail)
async def get_diary(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await _get_entry_or_404(entry_id, db)

    # Read content from filesystem
    try:
        content = read_diary_file(entry.content_path, settings.DIARY_STORAGE_PATH)
    except FileNotFoundError:
        content = entry.raw_text or ""

    return _entry_to_detail(entry, content)


@router.put("/{entry_id}", response_model=DiaryDetail)
async def update_diary(
    entry_id: uuid.UUID,
    body: DiaryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await _get_entry_or_404(entry_id, db)

    if entry.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can update this entry",
        )

    if body.manual_title is not None:
        entry.manual_title = body.manual_title
    if body.content is not None:
        import hashlib
        entry.raw_text = body.content
        new_hash = hashlib.md5(body.content.encode()).hexdigest()
        entry.content_hash = new_hash
        save_diary_file(
            user_id=str(current_user.id),
            entry_id=str(entry.id),
            content=body.content,
            base_path=settings.DIARY_STORAGE_PATH,
        )

        # Re-sync tags
        from sqlalchemy import delete as sql_delete
        await db.execute(sql_delete(DiaryTag).where(DiaryTag.entry_id == entry.id))
        tags = extract_tags(body.content)
        for tag_name in tags:
            db.add(DiaryTag(entry_id=entry.id, tag=tag_name.lower()))

    await db.flush()
    await db.refresh(entry, attribute_names=["tags", "references_out", "backlinks", "comments", "agent_tasks"])

    content = body.content if body.content is not None else (entry.raw_text or "")
    return _entry_to_detail(entry, content)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await _get_entry_or_404(entry_id, db)

    if entry.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete this entry",
        )

    # Delete file from disk
    delete_diary_file(entry.content_path, settings.DIARY_STORAGE_PATH)

    await db.delete(entry)
    await db.flush()


@router.get("/{entry_id}/references", response_model=list[ReferenceInfo])
async def get_references(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await _get_entry_or_404(entry_id, db)
    return [_ref_info(ref.target) for ref in entry.references_out]


@router.get("/{entry_id}/backlinks", response_model=list[ReferenceInfo])
async def get_backlinks(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await _get_entry_or_404(entry_id, db)
    return [_ref_info(ref.source) for ref in entry.backlinks]
