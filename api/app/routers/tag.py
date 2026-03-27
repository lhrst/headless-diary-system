"""Tag routes."""

from __future__ import annotations

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag, TagHierarchy
from app.models.user import User
from app.schemas.diary import DiaryBrief
from app.schemas.tag import (
    TagListResponse,
    TagSuggestItem,
    TagSuggestResponse,
    TagHierarchySet,
    TagTreeNode,
    TagTreeResponse,
)
from app.tasks.retag_tasks import retag_all_diaries

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


@router.get("/tree", response_model=TagTreeResponse)
async def get_tag_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return tags as a tree structure based on hierarchy relationships."""
    # Get all tags with counts
    tag_counts_result = await db.execute(
        select(DiaryTag.tag, func.count(DiaryTag.id).label("count"))
        .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
        .where(DiaryEntry.author_id == current_user.id)
        .group_by(DiaryTag.tag)
    )
    tag_counts = {row.tag: row.count for row in tag_counts_result.all()}

    # Get all hierarchy relationships
    hierarchy_result = await db.execute(
        select(TagHierarchy)
        .where(TagHierarchy.user_id == current_user.id)
    )
    hierarchies = hierarchy_result.scalars().all()

    # Build parent->children mapping
    children_map: dict[str, list[str]] = {}
    child_tags: set[str] = set()
    for h in hierarchies:
        children_map.setdefault(h.parent_tag, []).append(h.child_tag)
        child_tags.add(h.child_tag)

    def build_node(tag: str) -> TagTreeNode:
        children = children_map.get(tag, [])
        return TagTreeNode(
            tag=tag,
            count=tag_counts.get(tag, 0),
            children=[build_node(c) for c in sorted(children)],
        )

    # Root tags are those that are not children of any other tag
    all_tags = set(tag_counts.keys())
    root_tags = all_tags - child_tags

    tree = [build_node(t) for t in sorted(root_tags)]
    return TagTreeResponse(tree=tree)


@router.put("/hierarchy", status_code=200)
async def set_tag_hierarchy(
    body: TagHierarchySet,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set a parent-child relationship between two tags."""
    if body.tag == body.parent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A tag cannot be its own parent",
        )

    # Check for circular references: parent should not be a descendant of tag
    async def get_descendants(tag: str) -> set[str]:
        descendants: set[str] = set()
        queue = [tag]
        while queue:
            current = queue.pop()
            result = await db.execute(
                select(TagHierarchy.child_tag)
                .where(
                    TagHierarchy.user_id == current_user.id,
                    TagHierarchy.parent_tag == current,
                )
            )
            children = [r[0] for r in result.all()]
            for c in children:
                if c not in descendants:
                    descendants.add(c)
                    queue.append(c)
        return descendants

    descendants = await get_descendants(body.tag)
    if body.parent in descendants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Circular hierarchy detected",
        )

    # Remove existing parent relationship for this child tag
    await db.execute(
        sql_delete(TagHierarchy).where(
            TagHierarchy.user_id == current_user.id,
            TagHierarchy.child_tag == body.tag,
        )
    )

    # Create new relationship
    db.add(TagHierarchy(
        user_id=current_user.id,
        parent_tag=body.parent,
        child_tag=body.tag,
    ))
    await db.flush()

    return {"message": f"Set '{body.parent}' as parent of '{body.tag}'"}


@router.delete("/hierarchy/{tag}", status_code=200)
async def remove_tag_hierarchy(
    tag: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove the parent relationship for a tag (make it a root tag)."""
    result = await db.execute(
        sql_delete(TagHierarchy).where(
            TagHierarchy.user_id == current_user.id,
            TagHierarchy.child_tag == tag,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hierarchy relationship found for this tag",
        )
    await db.flush()
    return {"message": f"Removed hierarchy for tag '{tag}'"}


@router.post("/retag-all")
async def start_retag_all(
    current_user: User = Depends(get_current_user),
):
    """Kick off a Celery task to retag all diaries with a hierarchical taxonomy."""
    task = retag_all_diaries.delay(str(current_user.id))
    return {"task_id": task.id, "message": "Retag task started"}


@router.get("/retag-all/{task_id}")
async def get_retag_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll the retag task status."""
    result = AsyncResult(task_id)
    if result.state == "PENDING":
        return {"state": "PENDING", "message": "任务排队中..."}
    elif result.state == "PROGRESS":
        return {"state": "PROGRESS", **result.info}
    elif result.state == "SUCCESS":
        return {"state": "SUCCESS", **result.result}
    elif result.state == "FAILURE":
        return {"state": "FAILURE", "message": str(result.result)}
    return {"state": result.state, "message": str(result.info)}


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
            ai_tags=[t.tag for t in e.tags if t.is_ai],
            preview=(e.raw_text or "")[:120],
            created_at=e.created_at,
            updated_at=e.updated_at,
        )
        for e in entries
    ]
