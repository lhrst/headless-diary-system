from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DiaryReference(Base):
    __tablename__ = "diary_references"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", name="uq_diary_references_src_tgt"),
        CheckConstraint("source_id != target_id", name="ck_diary_references_no_self"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("diary_entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("diary_entries.id", ondelete="CASCADE"),
        nullable=False,
    )

    # relationships
    source: Mapped["DiaryEntry"] = relationship(
        "DiaryEntry",
        foreign_keys=[source_id],
        back_populates="references_out",
        lazy="selectin",
    )
    target: Mapped["DiaryEntry"] = relationship(
        "DiaryEntry",
        foreign_keys=[target_id],
        back_populates="backlinks",
        lazy="selectin",
    )
