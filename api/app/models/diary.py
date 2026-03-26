from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DiaryEntry(Base):
    __tablename__ = "diary_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    manual_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    auto_title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    content_path: Mapped[str] = mapped_column(String(500), nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    weather: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g. "晴 15°C"
    weather_icon: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g. "☀️"
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_agent_marked: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # relationships
    author: Mapped["User"] = relationship(
        "User", back_populates="diary_entries", lazy="selectin"
    )
    tags: Mapped[list["DiaryTag"]] = relationship(
        "DiaryTag", back_populates="entry", lazy="selectin", cascade="all, delete-orphan"
    )
    references_out: Mapped[list["DiaryReference"]] = relationship(
        "DiaryReference",
        foreign_keys="DiaryReference.source_id",
        back_populates="source",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    backlinks: Mapped[list["DiaryReference"]] = relationship(
        "DiaryReference",
        foreign_keys="DiaryReference.target_id",
        back_populates="target",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    comments: Mapped[list["DiaryComment"]] = relationship(
        "DiaryComment", back_populates="entry", lazy="selectin", cascade="all, delete-orphan"
    )
    agent_tasks: Mapped[list["AgentTask"]] = relationship(
        "AgentTask", back_populates="entry", lazy="selectin", cascade="all, delete-orphan"
    )
    media: Mapped[list["DiaryMedia"]] = relationship(
        "DiaryMedia", back_populates="entry", lazy="selectin"
    )
    versions: Mapped[list["DiaryVersion"]] = relationship(
        "DiaryVersion", back_populates="entry", lazy="noload",
        cascade="all, delete-orphan", order_by="DiaryVersion.created_at.desc()"
    )
