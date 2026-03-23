from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class TagSuggestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tag: str
    count: int


class TagSuggestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    suggestions: list[TagSuggestItem]


class TagListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tags: list[TagSuggestItem]
