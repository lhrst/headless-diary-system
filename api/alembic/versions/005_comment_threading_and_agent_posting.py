"""Add parent_comment_id for threaded replies + service-token support markers

Revision ID: 005
Revises: 004
Create Date: 2026-04-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Threaded replies: a comment can reply to another comment in the same entry.
    op.add_column(
        "diary_comments",
        sa.Column("parent_comment_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_diary_comments_parent",
        "diary_comments",
        "diary_comments",
        ["parent_comment_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_diary_comments_parent_comment_id",
        "diary_comments",
        ["parent_comment_id"],
    )
    # Speed up "fetch latest thread state" queries used by the agent poller.
    op.create_index(
        "ix_diary_comments_entry_created",
        "diary_comments",
        ["entry_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_diary_comments_entry_created", table_name="diary_comments")
    op.drop_index("ix_diary_comments_parent_comment_id", table_name="diary_comments")
    op.drop_constraint("fk_diary_comments_parent", "diary_comments", type_="foreignkey")
    op.drop_column("diary_comments", "parent_comment_id")
