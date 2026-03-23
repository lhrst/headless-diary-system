from __future__ import annotations

import uuid
import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entry_id: uuid.UUID
    author_id: uuid.UUID
    author_role: str
    content: str
    metadata_: dict[str, Any] | None = Field(default=None, alias="metadata_")
    created_at: datetime.datetime
