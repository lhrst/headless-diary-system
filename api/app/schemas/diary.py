from __future__ import annotations

import uuid
import datetime

from pydantic import BaseModel, ConfigDict


class DiaryCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str
    manual_title: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class DiaryUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str | None = None
    manual_title: str | None = None


class ReferenceInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    date: str


class DiaryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    title_source: str
    tags: list[str]
    ai_tags: list[str] = []
    preview: str
    address: str | None = None
    weather: str | None = None
    weather_icon: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class DiaryDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author: uuid.UUID
    title: str
    title_source: str
    content: str
    tags: list[str]
    ai_tags: list[str] = []
    references_out: list[ReferenceInfo]
    backlinks: list[ReferenceInfo]
    comments: list
    agent_tasks: list
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None
    weather: str | None = None
    weather_icon: str | None = None
    temperature: float | None = None
    is_agent_marked: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime


class DiaryListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[DiaryBrief]
    total: int
    page: int
    per_page: int


class DiarySuggestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    date: str
    preview: str


class DiarySuggestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    suggestions: list[DiarySuggestItem]
