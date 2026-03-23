"""Agent task execution via Celery."""
import httpx
from datetime import datetime, timezone

from app.tasks import celery_app
from app.config import settings
from app.database import sync_session_factory
from app.models.agent_task import AgentTask
from app.models.comment import DiaryComment
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag

import re
import json
import uuid


AGENT_SYSTEM_PROMPT = """You are a diary assistant. The user is reviewing their personal diary entries.

Current diary entry:
---
{current_diary_content}
---

{additional_context}

User's instruction: {command}

Respond concisely in the user's language. If asked to suggest tags, return them as a JSON array under a "suggested_tags" key along with your explanation."""


def _call_openrouter(messages: list[dict], model: str = None, max_tokens: int = 2000) -> dict:
    """Call OpenRouter API synchronously."""
    if model is None:
        model = "anthropic/claude-haiku-4-5-20251001"

    with httpx.Client(timeout=120) as client:
        response = client.post(
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        return response.json()


def _build_context_sync(db_session, command: str, entry_id: str) -> str:
    """Build LLM context based on command content (sync version for Celery)."""
    entry = db_session.query(DiaryEntry).filter(DiaryEntry.id == entry_id).first()
    if not entry:
        return ""

    parts = [entry.raw_text or ""]

    # If command mentions a tag, fetch recent entries with that tag
    tag_match = re.search(r'#([\w\u4e00-\u9fff]+)', command)
    if tag_match:
        tag = tag_match.group(1)
        tag_entries = (
            db_session.query(DiaryEntry)
            .join(DiaryTag, DiaryTag.entry_id == DiaryEntry.id)
            .filter(DiaryTag.tag == tag, DiaryEntry.author_id == entry.author_id)
            .order_by(DiaryEntry.created_at.desc())
            .limit(10)
            .all()
        )
        if tag_entries:
            parts.append(f"\nRecent entries tagged #{tag}:")
            for e in tag_entries:
                title = e.manual_title or e.auto_title or ""
                parts.append(f"---\n[{title}] ({e.created_at.date()})\n{(e.raw_text or '')[:500]}")

    # If command mentions [[ref]], fetch that diary
    ref_matches = re.findall(r'\[\[([^\]]+)\]\]', command)
    for ref in ref_matches:
        try:
            ref_uuid = uuid.UUID(ref.split("|")[0])
            ref_entry = db_session.query(DiaryEntry).filter(DiaryEntry.id == ref_uuid).first()
            if ref_entry:
                title = ref_entry.manual_title or ref_entry.auto_title or ""
                parts.append(f"\nReferenced diary [{title}]:\n{(ref_entry.raw_text or '')[:1000]}")
        except ValueError:
            pass

    # If "周报" or "本周", fetch this week's entries
    if any(kw in command for kw in ["周报", "本周", "这周", "weekly"]):
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=now.weekday())
        week_entries = (
            db_session.query(DiaryEntry)
            .filter(
                DiaryEntry.author_id == entry.author_id,
                DiaryEntry.created_at >= week_start,
            )
            .order_by(DiaryEntry.created_at.desc())
            .all()
        )
        if week_entries:
            parts.append(f"\nThis week's entries ({len(week_entries)} total):")
            for e in week_entries:
                title = e.manual_title or e.auto_title or ""
                parts.append(f"- [{title}] ({e.created_at.date()}): {(e.raw_text or '')[:200]}...")

    return "\n".join(parts)


@celery_app.task(bind=True, max_retries=2)
def run_agent(self, task_id: str):
    """Execute an agent task."""
    db = sync_session_factory()
    try:
        task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        if not task:
            return

        task.status = "running"
        db.commit()

        # Build context
        context = _build_context_sync(db, task.command, str(task.entry_id))

        # Choose model based on complexity
        model = "anthropic/claude-haiku-4-5-20251001"
        if any(kw in task.command for kw in ["分析", "对比", "规划", "深度"]):
            model = "anthropic/claude-sonnet-4-20250514"

        # Get current diary content
        entry = db.query(DiaryEntry).filter(DiaryEntry.id == task.entry_id).first()
        current_content = entry.raw_text or "" if entry else ""

        # Build prompt
        system_prompt = AGENT_SYSTEM_PROMPT.format(
            current_diary_content=current_content,
            additional_context=context,
            command=task.command,
        )

        # Call LLM via OpenRouter
        result = _call_openrouter(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": task.command},
            ],
            model=model,
        )

        result_text = result["choices"][0]["message"]["content"]
        tokens_used = result.get("usage", {}).get("completion_tokens", 0)

        # Post-process: extract suggested tags if present
        if "suggested_tags" in result_text:
            try:
                # Try to extract JSON array
                json_match = re.search(r'"suggested_tags"\s*:\s*(\[[^\]]+\])', result_text)
                if json_match:
                    tags = json.loads(json_match.group(1))
                    for tag_name in tags:
                        if isinstance(tag_name, str):
                            existing = (
                                db.query(DiaryTag)
                                .filter(DiaryTag.entry_id == task.entry_id, DiaryTag.tag == tag_name.lower())
                                .first()
                            )
                            if not existing:
                                db.add(DiaryTag(entry_id=task.entry_id, tag=tag_name.lower()))
                    entry.is_agent_marked = True
            except (json.JSONDecodeError, AttributeError):
                pass

        # Save result as comment
        comment = DiaryComment(
            entry_id=task.entry_id,
            author_id=uuid.UUID(settings.AGENT_USER_ID),
            author_role="agent",
            content=result_text,
            metadata_={"task_id": task_id, "model": model, "tokens": tokens_used},
        )
        db.add(comment)

        task.status = "done"
        task.result = result_text
        task.completed_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        db.rollback()
        task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        if task:
            task.status = "failed"
            task.error = str(e)
            db.commit()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()
