from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class TagSuggestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tag: str
    count: int
    is_ai: bool = False


class TagSuggestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    suggestions: list[TagSuggestItem]


class TagListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tags: list[TagSuggestItem]


# ── Tag Hierarchy ──

class TagHierarchySet(BaseModel):
    """Body for PUT /tags/hierarchy"""
    tag: str
    parent: str


class TagTreeNode(BaseModel):
    tag: str
    count: int
    children: list[TagTreeNode] = []


class TagTreeResponse(BaseModel):
    tree: list[TagTreeNode]
