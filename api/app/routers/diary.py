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
        ai_tags=[t.tag for t in entry.tags if t.is_ai],
        preview=preview,
        address=entry.address,
        weather=entry.weather,
        weather_icon=entry.weather_icon,
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
        ai_tags=[t.tag for t in entry.tags if t.is_ai],
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
        latitude=entry.latitude,
        longitude=entry.longitude,
        address=entry.address,
        weather=entry.weather,
        weather_icon=entry.weather_icon,
        temperature=entry.temperature,
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
    await db.refresh(entry)

    # Generate auto-title inline via OpenRouter
    try:
        import httpx
        _TITLE_PROMPT = ("用一句话（15字以内中文或8个词以内英文）概括这篇日记的核心内容，作为标题。"
                         "不要加引号和标点。直接输出标题。\n\n日记内容：\n" + body.content[:2000])
        with httpx.Client(timeout=30, proxy=None) as client:
            resp = client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "anthropic/claude-3.5-haiku",
                    "messages": [{"role": "user", "content": _TITLE_PROMPT}],
                    "max_tokens": 50,
                },
            )
            resp.raise_for_status()
            title = resp.json()["choices"][0]["message"]["content"].strip()
            title = title.strip('"\'""''').rstrip("。.!！?？")
            if title and len(title) <= 100:
                entry.auto_title = title
                await db.flush()
                await db.refresh(entry)
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log but don't fail

    # Auto-generate tags if none provided
    if not tags:
        try:
            import httpx
            from sqlalchemy import distinct
            # Get existing tags for context
            existing_tags_result = await db.execute(
                select(distinct(DiaryTag.tag))
                .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
                .where(DiaryEntry.author_id == current_user.id)
                .limit(50)
            )
            existing_tags = [r[0] for r in existing_tags_result.all()]

            tag_prompt = (
                "根据以下日记内容，生成1-3个简洁的标签（每个标签2-4个字）。\n"
                f"用户已有的标签：{', '.join(existing_tags[:30])}\n"
                "优先从已有标签中匹配，如果都不合适再创建新标签。\n"
                "只输出标签，用逗号分隔，不要加#号。\n\n"
                f"日记内容：{body.content[:1000]}"
            )
            with httpx.Client(timeout=15, proxy=None) as client:
                resp = client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "google/gemini-2.0-flash-001",
                        "messages": [{"role": "user", "content": tag_prompt}],
                        "max_tokens": 50,
                    },
                )
                resp.raise_for_status()
                ai_tags_raw = resp.json()["choices"][0]["message"]["content"].strip()
                ai_tags = [t.strip().strip("#").lower() for t in ai_tags_raw.split(",") if t.strip()]
                ai_tags = [t for t in ai_tags if len(t) <= 20 and len(t) >= 1][:3]

                for tag_name in ai_tags:
                    db.add(DiaryTag(entry_id=entry.id, tag=tag_name, is_ai=True))
                tags = ai_tags
                await db.flush()
        except Exception:
            import traceback
            traceback.print_exc()

    # Fetch weather and address if coordinates provided
    if body.latitude is not None and body.longitude is not None:
        from app.utils.geo_weather import get_weather, reverse_geocode
        import asyncio

        entry.latitude = body.latitude
        entry.longitude = body.longitude

        weather_task = get_weather(body.latitude, body.longitude)
        address_task = reverse_geocode(body.latitude, body.longitude)
        weather_data, address = await asyncio.gather(weather_task, address_task)

        if weather_data:
            entry.weather = weather_data.get("weather")
            entry.weather_icon = weather_data.get("weather_icon")
            entry.temperature = weather_data.get("temperature")
        if address:
            entry.address = address

        await db.flush()
        await db.refresh(entry)

    # Determine which tags are AI-generated
    ai_tags = []
    try:
        await db.refresh(entry, attribute_names=["tags"])
        ai_tags = [t.tag for t in entry.tags if t.is_ai]
    except Exception:
        pass

    # Build response directly (avoid lazy-load issues)
    return DiaryDetail(
        id=entry.id,
        author=entry.author_id,
        title=entry.auto_title or entry.manual_title or "Untitled",
        title_source="auto" if entry.auto_title else ("manual" if entry.manual_title else "none"),
        content=body.content,
        tags=tags,
        ai_tags=ai_tags,
        references_out=[],
        backlinks=[],
        comments=[],
        agent_tasks=[{"id": str(t.id), "command": cmd, "status": "pending", "created_at": ""} for t, cmd in zip([], agent_cmds)],
        latitude=entry.latitude,
        longitude=entry.longitude,
        address=entry.address,
        weather=entry.weather,
        weather_icon=entry.weather_icon,
        temperature=entry.temperature,
        is_agent_marked=bool(agent_cmds),
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


@router.get("", response_model=DiaryListResponse)
async def list_diaries(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tag: str | None = None,
    q: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    has_location: bool | None = None,
    weather: str | None = None,
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
    if has_location is True:
        query = query.where(DiaryEntry.latitude.isnot(None))
        count_query = count_query.where(DiaryEntry.latitude.isnot(None))
    elif has_location is False:
        query = query.where(DiaryEntry.latitude.is_(None))
        count_query = count_query.where(DiaryEntry.latitude.is_(None))
    if weather:
        like_expr_w = f"%{weather}%"
        query = query.where(DiaryEntry.weather.ilike(like_expr_w))
        count_query = count_query.where(DiaryEntry.weather.ilike(like_expr_w))

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


@router.post("/batch-titles", status_code=200)
async def batch_generate_titles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scan all untitled diaries and generate titles using a cheap model."""
    import httpx

    # Find all entries without auto_title
    result = await db.execute(
        select(DiaryEntry)
        .where(
            DiaryEntry.author_id == current_user.id,
            DiaryEntry.auto_title.is_(None),
            DiaryEntry.raw_text.isnot(None),
        )
        .order_by(DiaryEntry.created_at.desc())
    )
    entries = result.scalars().all()

    if not entries:
        return {"message": "No untitled diaries found", "updated": 0}

    updated = 0
    errors = []
    CHEAP_MODEL = "google/gemini-2.0-flash-001"

    for entry in entries:
        try:
            prompt = ("用一句话（15字以内中文或8个词以内英文）概括这篇日记的核心内容，作为标题。"
                      "不要加引号和标点。直接输出标题。\n\n日记内容：\n" + (entry.raw_text or "")[:2000])
            with httpx.Client(timeout=30, proxy=None) as client:
                resp = client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": CHEAP_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 50,
                    },
                )
                resp.raise_for_status()
                title = resp.json()["choices"][0]["message"]["content"].strip()
                title = title.strip('"\'""''').rstrip("。.!！?？")
                if title and len(title) <= 100:
                    entry.auto_title = title
                    updated += 1
        except Exception as e:
            errors.append({"entry_id": str(entry.id), "error": str(e)})

    await db.flush()
    return {
        "message": f"Generated {updated} titles out of {len(entries)} untitled diaries",
        "updated": updated,
        "total": len(entries),
        "model": CHEAP_MODEL,
        "errors": errors[:5] if errors else [],
    }


@router.post("/batch-tags", status_code=200)
async def batch_generate_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scan all diaries without tags and generate tags using a cheap model."""
    import httpx
    from sqlalchemy import distinct, exists

    # Find entries with no tags at all
    has_tags_subq = (
        select(DiaryTag.entry_id)
        .where(DiaryTag.entry_id == DiaryEntry.id)
        .correlate(DiaryEntry)
        .exists()
    )
    result = await db.execute(
        select(DiaryEntry)
        .where(
            DiaryEntry.author_id == current_user.id,
            DiaryEntry.raw_text.isnot(None),
            ~has_tags_subq,
        )
        .order_by(DiaryEntry.created_at.desc())
    )
    entries = result.scalars().all()

    if not entries:
        return {"message": "No untagged diaries found", "updated": 0}

    # Get existing tags for context
    existing_tags_result = await db.execute(
        select(distinct(DiaryTag.tag))
        .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
        .where(DiaryEntry.author_id == current_user.id)
        .limit(50)
    )
    existing_tags = [r[0] for r in existing_tags_result.all()]

    updated = 0
    errors = []
    CHEAP_MODEL = "google/gemini-2.0-flash-001"

    for entry in entries:
        try:
            tag_prompt = (
                "根据以下日记内容，生成1-3个简洁的标签（每个标签2-4个字）。\n"
                f"用户已有的标签：{', '.join(existing_tags[:30])}\n"
                "优先从已有标签中匹配，如果都不合适再创建新标签。\n"
                "只输出标签，用逗号分隔，不要加#号。\n\n"
                f"日记内容：{(entry.raw_text or '')[:1000]}"
            )
            with httpx.Client(timeout=15, proxy=None) as client:
                resp = client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": CHEAP_MODEL,
                        "messages": [{"role": "user", "content": tag_prompt}],
                        "max_tokens": 50,
                    },
                )
                resp.raise_for_status()
                ai_tags_raw = resp.json()["choices"][0]["message"]["content"].strip()
                ai_tags = [t.strip().strip("#").lower() for t in ai_tags_raw.split(",") if t.strip()]
                ai_tags = [t for t in ai_tags if len(t) <= 20 and len(t) >= 1][:3]

                for tag_name in ai_tags:
                    db.add(DiaryTag(entry_id=entry.id, tag=tag_name, is_ai=True))

                if ai_tags:
                    updated += 1
                    # Update existing_tags list for subsequent entries
                    for t in ai_tags:
                        if t not in existing_tags:
                            existing_tags.append(t)
        except Exception as e:
            errors.append({"entry_id": str(entry.id), "error": str(e)})

    await db.flush()
    return {
        "message": f"Generated tags for {updated} out of {len(entries)} untagged diaries",
        "updated": updated,
        "total": len(entries),
        "model": CHEAP_MODEL,
        "errors": errors[:5] if errors else [],
    }
