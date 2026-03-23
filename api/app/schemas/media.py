from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict


class MediaUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    media_type: str
    original_name: str
    file_size: int
    url: str
    thumb_url: str | None = None
    media_text_status: str | None = None
    markdown_embed: str


class MediaInfoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    media_type: str
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    media_text_status: str | None = None
    media_text_method: str | None = None
    media_text: str | None = None
    media_text_metadata: dict[str, Any] | None = None


class MediaUpdateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry_id: uuid.UUID | None = None
    original_name: str | None = None
