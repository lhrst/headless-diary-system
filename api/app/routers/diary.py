"""Diary CRUD routes."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.diary import DiaryEntry
from app.models.reference import DiaryReference
from app.models.tag import DiaryTag
from app.models.user import User
from app.services.agent_user import AGENT_UUID


def _visible_author_clause(user: User):
    """SQL clause for 'entries this user should see in their feed'.

    Includes the user's own entries **and** all entries authored by the
    built-in agent user, so agent-generated posts appear in everyone's feed.
    Kept narrow on purpose: we deliberately do NOT include posts by other
    real users — the diary is per-user, the agent is the one shared author.
    """
    return or_(
        DiaryEntry.author_id == user.id,
        DiaryEntry.author_id == AGENT_UUID,
    )
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

import re as _re
_HTML_TAG_RE = _re.compile(r"<[^>]+>")

def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text).strip()

def _entry_title(entry: DiaryEntry) -> str:
    return entry.manual_title or entry.auto_title or "Untitled"


def _entry_title_source(entry: DiaryEntry) -> str:
    if entry.manual_title:
        return "manual"
    if entry.auto_title:
        return "auto"
    return "none"


def _build_search_filter(q: str):
    """Build a combined search filter: FTS + trigram + title match.

    If the query looks like a natural language question (>6 chars, contains
    question-like patterns), expand it into keywords via LLM for better recall.
    """
    from sqlalchemy import text, or_

    keywords = q.strip()

    # For natural-language queries, use LLM to extract search keywords
    if len(keywords) > 6 and any(c in keywords for c in "？?怎什为吗哪能不如何关于"):
        try:
            import httpx
            with httpx.Client(timeout=8, proxy=None) as client:
                resp = client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.LLM_MODEL_FAST,
                        "messages": [{"role": "user", "content":
                            f"将以下搜索意图拆解为2-5个搜索关键词，用空格分隔，不要其他内容：\n{keywords}"
                        }],
                        "max_tokens": 30,
                    },
                )
                resp.raise_for_status()
                expanded = resp.json()["choices"][0]["message"]["content"].strip()
                if expanded and len(expanded) < 100:
                    keywords = expanded
        except Exception:
            pass

    # Build combined OR filter using raw SQL for PG-specific features
    words = [w for w in keywords.split() if w]
    tsquery_str = " | ".join(words) if words else q

    return or_(
        # FTS full-text search on content
        text("to_tsvector('simple', COALESCE(raw_text, '')) @@ to_tsquery('simple', :tsq)").bindparams(tsq=tsquery_str),
        # Trigram similarity on title
        text("similarity(COALESCE(manual_title, auto_title, ''), :trgm_q) > 0.2").bindparams(trgm_q=q),
        # Fallback ILIKE
        DiaryEntry.raw_text.ilike(f"%{q}%"),
    )


def _entry_to_brief(entry: DiaryEntry) -> DiaryBrief:
    preview = _strip_html(entry.raw_text or "")[:120]
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
        is_agent_authored=entry.author_id == AGENT_UUID,
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
        is_agent_authored=entry.author_id == AGENT_UUID,
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

    # Parse @agent commands → create agent tasks and dispatch to Celery
    from app.models.agent_task import AgentTask
    agent_cmds = extract_agent_commands(body.content)
    agent_task_ids = []
    for cmd in agent_cmds:
        # Classify: improvement or chat
        import re as _re
        _improvement_kw = _re.compile(r"改进|改善|优化|添加功能|新增|修复|improve|add feature|fix", _re.IGNORECASE)
        task_type = "improvement" if _improvement_kw.search(cmd) else "chat"
        task = AgentTask(
            entry_id=entry.id, user_id=current_user.id,
            command=cmd, task_type=task_type,
        )
        db.add(task)
        await db.flush()
        await db.refresh(task)
        agent_task_ids.append(str(task.id))

    await db.flush()
    await db.refresh(entry)

    # Dispatch agent tasks to Celery (after flush so IDs are available)
    for tid in agent_task_ids:
        try:
            from app.tasks.agent_tasks import run_agent
            run_agent.delay(tid)
        except Exception:
            pass

    # Generate auto-title inline via OpenRouter
    try:
        import httpx
        _TITLE_PROMPT = ("为这篇日记生成一个简短标题，要求：\n1. 最多10个中文字或5个英文词\n2. 不要引号、标点、解释\n3. 只输出标题本身\n\n日记内容：\n" + body.content[:2000])
        with httpx.Client(timeout=30, proxy=None) as client:
            resp = client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.LLM_MODEL_FAST,
                    "messages": [{"role": "user", "content": _TITLE_PROMPT}],
                    "max_tokens": 50,
                },
            )
            resp.raise_for_status()
            title = resp.json()["choices"][0]["message"]["content"].strip()
            title = title.strip('"\'""''').rstrip("。.!！?？")
            title = title[:30]  # Hard limit
            if "。" in title:
                title = title.split("。")[0]
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
                "根据日记内容生成1-3个分类标签。要求：\n"
                "1. **必须优先从已有标签中选择**，只有当日记话题完全不在已有标签范围内时才能创建新标签\n"
                f"2. 已有标签列表：{', '.join(existing_tags[:50])}\n"
                "3. 每个标签2-4个字，必须是有意义的分类词\n"
                "4. 不要用日记中出现的原词做标签\n"
                "5. 不要用问候语、感叹词做标签\n"
                "6. 只输出标签，用逗号分隔\n\n"
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
                        "model": settings.LLM_MODEL_FAST,
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

                # Auto-attach new tags to hierarchy tree
                from app.models.tag import TagHierarchy
                # Get existing hierarchy parent tags
                hierarchy_result = await db.execute(
                    select(TagHierarchy.parent_tag, TagHierarchy.child_tag)
                    .where(TagHierarchy.user_id == current_user.id)
                )
                hierarchy_rows = hierarchy_result.all()
                parent_tags = set(r[0] for r in hierarchy_rows)
                child_tags = set(r[1] for r in hierarchy_rows)
                all_hierarchy_tags = parent_tags | child_tags

                for tag_name in ai_tags:
                    if tag_name not in all_hierarchy_tags and parent_tags:
                        # New tag not in tree — find best parent via LLM
                        parent_list = ", ".join(sorted(parent_tags))
                        parent_resp = client.post(
                            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                            headers={
                                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                                "Content-Type": "application/json",
                            },
                            json={
                                "model": settings.LLM_MODEL_FAST,
                                "messages": [{"role": "user", "content":
                                    f"标签「{tag_name}」应该归类到以下哪个父标签下？\n"
                                    f"父标签列表：{parent_list}\n"
                                    f"只输出一个父标签名，不要其他内容。"
                                }],
                                "max_tokens": 20,
                            },
                        )
                        parent_resp.raise_for_status()
                        chosen_parent = parent_resp.json()["choices"][0]["message"]["content"].strip()
                        if chosen_parent in parent_tags:
                            db.add(TagHierarchy(
                                user_id=current_user.id,
                                parent_tag=chosen_parent,
                                child_tag=tag_name,
                            ))
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
        agent_tasks=[],
        latitude=entry.latitude,
        longitude=entry.longitude,
        address=entry.address,
        weather=entry.weather,
        weather_icon=entry.weather_icon,
        temperature=entry.temperature,
        is_agent_marked=bool(agent_cmds),
        is_agent_authored=entry.author_id == AGENT_UUID,
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
    visible = _visible_author_clause(current_user)
    query = (
        select(DiaryEntry)
        .options(selectinload(DiaryEntry.tags))
        .where(visible)
    )
    count_query = (
        select(func.count())
        .select_from(DiaryEntry)
        .where(visible)
    )

    # Filters
    if tag:
        query = query.join(DiaryTag).where(DiaryTag.tag == tag)
        count_query = count_query.join(DiaryTag).where(DiaryTag.tag == tag)
    if q:
        search_filter = _build_search_filter(q)
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
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
            _visible_author_clause(current_user),
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


@router.get("/daily-insight")
async def get_daily_insight(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a daily insight summary of recent thinking themes. Cached in Redis for 12h."""
    import redis as redis_lib
    import httpx

    cache_key = f"daily_insight:{current_user.id}:{date.today().isoformat()}"
    try:
        r = redis_lib.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        cached = r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        r = None

    since = datetime.utcnow() - timedelta(days=7)
    result = await db.execute(
        select(DiaryEntry)
        .where(DiaryEntry.author_id == current_user.id, DiaryEntry.created_at >= since)
        .order_by(DiaryEntry.created_at.desc())
    )
    entries = result.scalars().all()

    if not entries:
        return {"insight": "", "entry_count": 0}

    summaries = []
    for e in entries[:20]:
        title = e.manual_title or e.auto_title or ""
        content = (e.raw_text or "")[:200].replace("\n", " ")
        summaries.append(f"- {title}: {content}")

    prompt = (
        "你是一个个人思考教练。以下是用户最近7天的日记摘要：\n\n"
        + "\n".join(summaries)
        + "\n\n请用2-3句话总结用户最近的思考重点和关注方向，语气温和、有洞察力。"
        "不要列举日记标题，要提炼出背后的思考脉络。控制在80字以内。"
    )

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.LLM_MODEL_FAST,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                },
            )
            resp.raise_for_status()
            insight = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return {"insight": "", "entry_count": len(entries)}

    result_data = {"insight": insight, "entry_count": len(entries)}

    if r:
        try:
            r.setex(cache_key, 43200, json.dumps(result_data, ensure_ascii=False))
        except Exception:
            pass

    return result_data


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

    # Save current version as history before editing
    from app.models.version import DiaryVersion
    old_content = entry.raw_text or ""
    try:
        from app.utils.file_storage import read_diary_file
        old_content = read_diary_file(entry.content_path, settings.DIARY_STORAGE_PATH)
    except Exception:
        pass
    old_tags = ",".join([t.tag for t in entry.tags])
    old_title = entry.manual_title or entry.auto_title or ""
    db.add(DiaryVersion(
        entry_id=entry.id,
        title=old_title,
        content=old_content,
        tags=old_tags,
    ))

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
    await db.refresh(entry)

    # Re-fetch with eager loading to avoid greenlet issues
    result = await db.execute(
        select(DiaryEntry)
        .options(
            selectinload(DiaryEntry.tags),
            selectinload(DiaryEntry.references_out),
            selectinload(DiaryEntry.backlinks),
            selectinload(DiaryEntry.comments),
            selectinload(DiaryEntry.agent_tasks),
        )
        .where(DiaryEntry.id == entry_id)
    )
    entry = result.scalar_one()

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


@router.get("/{entry_id}/versions")
async def get_versions(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get edit history for a diary entry."""
    from app.models.version import DiaryVersion
    result = await db.execute(
        select(DiaryVersion)
        .where(DiaryVersion.entry_id == entry_id)
        .order_by(DiaryVersion.created_at.desc())
    )
    versions = result.scalars().all()
    return [
        {
            "id": str(v.id),
            "title": v.title,
            "content": v.content,
            "tags": v.tags.split(",") if v.tags else [],
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]


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
    CHEAP_MODEL = settings.LLM_MODEL_FAST

    for entry in entries:
        try:
            prompt = ("为这篇日记生成一个简短标题，要求：\n1. 最多10个中文字或5个英文词\n2. 不要引号、标点、解释\n3. 只输出标题本身\n\n日记内容：\n" + (entry.raw_text or "")[:2000])
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
                title = title[:30]  # Hard limit
                if "。" in title:
                    title = title.split("。")[0]
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
    CHEAP_MODEL = settings.LLM_MODEL_FAST

    for entry in entries:
        try:
            tag_prompt = (
                "根据日记内容生成1-3个分类标签。要求：\n"
                "1. **必须优先从已有标签中选择**，只有当日记话题完全不在已有标签范围内时才能创建新标签\n"
                f"2. 已有标签列表：{', '.join(existing_tags[:50])}\n"
                "3. 每个标签2-4个字，必须是有意义的分类词\n"
                "4. 不要用日记中出现的原词做标签\n"
                "5. 不要用问候语、感叹词做标签\n"
                "6. 只输出标签，用逗号分隔\n\n"
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


