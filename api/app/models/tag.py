from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DiaryTag(Base):
    __tablename__ = "diary_tags"
    __table_args__ = (
        UniqueConstraint("entry_id", "tag", name="uq_diary_tags_entry_tag"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("diary_entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag: Mapped[str] = mapped_column(String(100), nullable=False)

    # relationships
    entry: Mapped["DiaryEntry"] = relationship(
        "DiaryEntry", back_populates="tags", lazy="selectin"
    )
