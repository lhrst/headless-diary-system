"""Agent task execution via Celery.

Chat-type tasks (from `@agent` comments) are NOT handled here anymore —
they stay at status='pending' in the DB, waiting for HappyClaw (on the
user's Mac) to claim them via `/api/v1/agent-service/claim-tasks` and
post the reply back via `/api/v1/agent-service/task/{id}/result`.

Only improvement-type tasks (code changes via Claude Code CLI) still run
in this worker.
"""
import subprocess
from datetime import datetime, timezone

from app.tasks import celery_app
from app.database import sync_session_factory
from app.models.agent_task import AgentTask
from app.models.comment import DiaryComment
from app.services.agent_user import AGENT_UUID


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
    """Execute an improvement-type agent task via Claude Code CLI.

    Chat-type tasks should never reach this worker (the routers only
    dispatch improvement tasks). If one slips through, we leave it at
    status='pending' so HappyClaw can still claim it.
    """
    db = sync_session_factory()
    try:
        task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        if not task:
            return

        if task.task_type != "improvement":
            # Not our job — HappyClaw will claim it.
            return

        task.status = "running"
        db.commit()
        _handle_improvement(db, task)

    except Exception as e:
        db.rollback()
        task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        if task:
            task.status = "failed"
            task.error = str(e)
            try:
                _post_agent_comment(db, task, f"任务执行失败：{e}")
            except Exception:
                pass
            db.commit()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()


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
        subprocess.run(
            ["git", "add", "-A"],
            cwd="/app", capture_output=True, timeout=30,
        )
        subprocess.run(
            ["git", "commit", "-m", f"agent: {task.command[:80]}"],
            cwd="/app", capture_output=True, text=True, timeout=30,
        )

        # Get diff summary
        diff_result = subprocess.run(
            ["git", "diff", "--stat", "HEAD~1"],
            cwd="/app", capture_output=True, text=True, timeout=30,
        )
        diff_summary = diff_result.stdout or "无变更"

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
