"""Agent task execution via Celery."""
import httpx
import subprocess
from datetime import datetime, timezone

from app.tasks import celery_app
from app.config import settings
from app.database import sync_session_factory
from app.models.agent_task import AgentTask
from app.models.comment import DiaryComment
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag
from app.services.agent_user import AGENT_UUID

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
        model = settings.LLM_MODEL_FAST

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


def _post_agent_comment(db, task, content: str, metadata: dict | None = None) -> DiaryComment:
    """Create a comment from the Agent user and link it to the task."""
    comment = DiaryComment(
        entry_id=task.entry_id,
        author_id=AGENT_UUID,
        author_role="agent",
        content=content,
        metadata_=metadata,
    )
    db.add(comment)
    db.flush()
    return comment


@celery_app.task(bind=True, max_retries=2)
def run_agent(self, task_id: str):
    """Execute an agent task — routes to chat or improvement handler."""
    db = sync_session_factory()
    try:
        task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        if not task:
            return

        task.status = "running"
        db.commit()

        if task.task_type == "improvement":
            _handle_improvement(db, task)
        else:
            _handle_chat(db, task)

    except Exception as e:
        db.rollback()
        task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        if task:
            task.status = "failed"
            task.error = str(e)
            # Post failure comment
            try:
                _post_agent_comment(db, task, f"任务执行失败：{e}")
            except Exception:
                pass
            db.commit()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()


def _handle_chat(db, task: AgentTask):
    """Handle a chat-type agent command using LLM."""
    # Build context
    context = _build_context_sync(db, task.command, str(task.entry_id))

    # Choose model based on complexity
    model = settings.LLM_MODEL_FAST
    if any(kw in task.command for kw in ["分析", "对比", "规划", "深度"]):
        model = settings.LLM_MODEL_SMART

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
                if entry:
                    entry.is_agent_marked = True
        except (json.JSONDecodeError, AttributeError):
            pass

    # Save result as comment
    comment = _post_agent_comment(
        db, task, result_text,
        metadata={"task_id": str(task.id), "model": model, "tokens": tokens_used},
    )

    task.status = "done"
    task.result = result_text
    task.result_comment_id = comment.id
    task.completed_at = datetime.now(timezone.utc)
    db.commit()


def _handle_improvement(db, task: AgentTask):
    """Handle an improvement-type command by invoking Claude Code CLI."""
    from app.models.user import User

    # Security: only admin users can trigger improvements
    user = db.query(User).filter(User.id == task.user_id).first()
    if not user or user.role not in ("admin", "owner"):
        comment = _post_agent_comment(
            db, task,
            "抱歉，只有管理员可以触发代码改进命令。",
        )
        task.status = "done"
        task.result = "Permission denied: admin only"
        task.result_comment_id = comment.id
        task.completed_at = datetime.now(timezone.utc)
        db.commit()
        return

    # Post "working on it" comment
    _post_agent_comment(db, task, f"收到改进建议，正在分析...\n> {task.command}")
    db.commit()

    # Invoke Claude Code CLI
    try:
        prompt = (
            f"根据用户需求修改代码: {task.command}\n\n"
            f"项目根目录在当前工作目录。请直接修改代码文件并确保改动合理。"
        )
        proc = subprocess.run(
            [
                "claude",
                "-p", prompt,
                "--allowedTools", "Edit,Write,Bash,Read,Glob,Grep",
            ],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            cwd="/app",   # project root inside Docker
        )

        claude_output = proc.stdout or ""
        claude_error = proc.stderr or ""

        if proc.returncode != 0:
            error_msg = f"Claude Code 执行失败 (exit {proc.returncode}):\n{claude_error[:500]}"
            comment = _post_agent_comment(db, task, error_msg)
            task.status = "failed"
            task.error = error_msg
            task.result_comment_id = comment.id
            task.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        # Auto commit changes
        commit_msg = f"agent: {task.command[:80]}"
        subprocess.run(
            ["git", "add", "-A"],
            cwd="/app", capture_output=True, timeout=30,
        )
        commit_result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd="/app", capture_output=True, text=True, timeout=30,
        )

        # Get diff summary
        diff_result = subprocess.run(
            ["git", "diff", "--stat", "HEAD~1"],
            cwd="/app", capture_output=True, text=True, timeout=30,
        )
        diff_summary = diff_result.stdout or "无变更"

        # Post success comment
        result_text = (
            f"改进已完成！\n\n"
            f"**变更摘要：**\n```\n{diff_summary[:1000]}\n```\n\n"
            f"**Claude Code 输出：**\n{claude_output[:2000]}"
        )
        comment = _post_agent_comment(
            db, task, result_text,
            metadata={"task_id": str(task.id), "type": "improvement"},
        )

        task.status = "done"
        task.result = result_text
        task.result_comment_id = comment.id
        task.completed_at = datetime.now(timezone.utc)
        db.commit()

    except subprocess.TimeoutExpired:
        error_msg = "Claude Code 执行超时（5分钟限制）"
        comment = _post_agent_comment(db, task, error_msg)
        task.status = "failed"
        task.error = error_msg
        task.result_comment_id = comment.id
        task.completed_at = datetime.now(timezone.utc)
        db.commit()
    except FileNotFoundError:
        error_msg = "Claude Code CLI 未安装或不在 PATH 中"
        comment = _post_agent_comment(db, task, error_msg)
        task.status = "failed"
        task.error = error_msg
        task.result_comment_id = comment.id
        task.completed_at = datetime.now(timezone.utc)
        db.commit()
