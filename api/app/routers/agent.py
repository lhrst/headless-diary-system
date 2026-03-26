"""Agent task routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.agent_task import AgentTask
from app.models.diary import DiaryEntry
from app.models.user import User
from app.schemas.agent import AgentDispatch, AgentTaskResponse

router = APIRouter(prefix="/agent", tags=["agent"])


@router.get("/tasks", response_model=list[AgentTaskResponse])
async def list_tasks(
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(AgentTask).where(AgentTask.user_id == current_user.id)
    if status_filter:
        query = query.where(AgentTask.status == status_filter)
    query = query.order_by(AgentTask.created_at.desc())

    result = await db.execute(query)
    tasks = result.scalars().all()
    return tasks


@router.get("/tasks/{task_id}", response_model=AgentTaskResponse)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AgentTask).where(
            AgentTask.id == task_id,
            AgentTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent task not found",
        )
    return task


@router.post("/dispatch", response_model=AgentTaskResponse, status_code=status.HTTP_201_CREATED)
async def dispatch_task(
    body: AgentDispatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify entry exists
    result = await db.execute(select(DiaryEntry).where(DiaryEntry.id == body.entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found",
        )

    task = AgentTask(
        entry_id=body.entry_id,
        user_id=current_user.id,
        command=body.command,
        status="pending",
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)

    # Dispatch to Celery
    try:
        from app.tasks.agent_tasks import run_agent
        run_agent.delay(str(task.id))
    except Exception:
        pass

    return task


@router.get("/tasks/by-entry/{entry_id}", response_model=list[AgentTaskResponse])
async def list_tasks_by_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List agent tasks for a specific diary entry (used for polling)."""
    result = await db.execute(
        select(AgentTask)
        .where(AgentTask.entry_id == entry_id, AgentTask.user_id == current_user.id)
        .order_by(AgentTask.created_at.desc())
    )
    return result.scalars().all()


@router.post("/retry/{task_id}", response_model=AgentTaskResponse)
async def retry_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AgentTask).where(
            AgentTask.id == task_id,
            AgentTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent task not found",
        )

    if task.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only failed tasks can be retried",
        )

    task.status = "pending"
    task.error = None
    task.result = None
    task.completed_at = None
    await db.flush()
    await db.refresh(task)

    # Re-dispatch to Celery
    try:
        from app.tasks.agent_tasks import run_agent
        run_agent.delay(str(task.id))
    except Exception:
        pass

    return task
