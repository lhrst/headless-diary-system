"""Initial schema - all tables

Revision ID: 001
Revises:
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Users
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("username", sa.String(50), unique=True, nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("role", sa.String(20), server_default="user", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Diary entries
    op.create_table(
        "diary_entries",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("manual_title", sa.String(200), nullable=True),
        sa.Column("auto_title", sa.String(100), nullable=True),
        sa.Column("content_path", sa.String(500), nullable=False),
        sa.Column("raw_text", sa.Text, nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("is_agent_marked", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_diary_author", "diary_entries", ["author_id"])
    op.create_index("idx_diary_created", "diary_entries", [sa.text("created_at DESC")])
    op.execute(
        "CREATE INDEX idx_diary_fts ON diary_entries USING gin(to_tsvector('simple', COALESCE(raw_text, '')))"
    )
    op.execute(
        "CREATE INDEX idx_diary_title_trgm ON diary_entries USING gin("
        "COALESCE(manual_title, auto_title, '') gin_trgm_ops)"
    )

    # Tags
    op.create_table(
        "diary_tags",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("entry_id", UUID(as_uuid=True), sa.ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag", sa.String(100), nullable=False),
        sa.UniqueConstraint("entry_id", "tag", name="uq_diary_tags_entry_tag"),
    )
    op.create_index("idx_tag_name", "diary_tags", ["tag"])
    op.create_index("idx_tag_entry", "diary_tags", ["entry_id"])

    # References
    op.create_table(
        "diary_references",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", UUID(as_uuid=True), sa.ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("source_id", "target_id", name="uq_diary_references_src_tgt"),
        sa.CheckConstraint("source_id != target_id", name="ck_diary_references_no_self"),
    )
    op.create_index("idx_ref_source", "diary_references", ["source_id"])
    op.create_index("idx_ref_target", "diary_references", ["target_id"])

    # Comments
    op.create_table(
        "diary_comments",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("entry_id", UUID(as_uuid=True), sa.ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_role", sa.String(20), server_default="user", nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_comment_entry", "diary_comments", ["entry_id", "created_at"])

    # Agent tasks
    op.create_table(
        "agent_tasks",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("entry_id", UUID(as_uuid=True), sa.ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("command", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("result", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_agent_task_status", "agent_tasks", ["status"])
    op.create_index("idx_agent_task_entry", "agent_tasks", ["entry_id"])

    # Media
    op.create_table(
        "diary_media",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("entry_id", UUID(as_uuid=True), sa.ForeignKey("diary_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_type", sa.String(10), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=True),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("thumb_path", sa.String(500), nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=False),
        sa.Column("width", sa.Integer, nullable=True),
        sa.Column("height", sa.Integer, nullable=True),
        sa.Column("duration_ms", sa.BigInteger, nullable=True),
        sa.Column("media_text", sa.Text, nullable=True),
        sa.Column("media_text_lang", sa.String(10), nullable=True),
        sa.Column("media_text_status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("media_text_method", sa.String(50), nullable=True),
        sa.Column("media_text_metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_media_entry", "diary_media", ["entry_id"])
    op.create_index("idx_media_user", "diary_media", ["user_id"])
    op.create_index("idx_media_type", "diary_media", ["media_type"])
    op.create_index("idx_media_text_status", "diary_media", ["media_text_status"])
    op.execute(
        "CREATE INDEX idx_media_text_fts ON diary_media "
        "USING gin(to_tsvector('simple', COALESCE(media_text, '')))"
    )


def downgrade() -> None:
    op.drop_table("diary_media")
    op.drop_table("agent_tasks")
    op.drop_table("diary_comments")
    op.drop_table("diary_references")
    op.drop_table("diary_tags")
    op.drop_table("diary_entries")
    op.drop_table("users")
