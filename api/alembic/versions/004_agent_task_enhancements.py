"""Add result_comment_id and task_type to agent_tasks

Revision ID: 004
Revises: 003
Create Date: 2026-03-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # task_type: "chat" (default) or "improvement"
    op.add_column(
        "agent_tasks",
        sa.Column("task_type", sa.String(20), server_default="chat", nullable=False),
    )
    # Link back to the comment the agent posted as a result
    op.add_column(
        "agent_tasks",
        sa.Column("result_comment_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_agent_tasks_result_comment",
        "agent_tasks",
        "diary_comments",
        ["result_comment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_agent_tasks_result_comment", "agent_tasks", type_="foreignkey")
    op.drop_column("agent_tasks", "result_comment_id")
    op.drop_column("agent_tasks", "task_type")
