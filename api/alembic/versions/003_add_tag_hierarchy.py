"""Add is_ai to diary_tags and create tag_hierarchy table

Revision ID: 003
Revises: 002
Create Date: 2026-03-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "diary_tags",
        sa.Column("is_ai", sa.Boolean, server_default=sa.text("false"), nullable=False),
    )
    op.create_table(
        "tag_hierarchy",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_tag", sa.String(100), nullable=False),
        sa.Column("child_tag", sa.String(100), nullable=False),
        sa.UniqueConstraint("user_id", "parent_tag", "child_tag"),
    )


def downgrade() -> None:
    op.drop_table("tag_hierarchy")
    op.drop_column("diary_tags", "is_ai")
