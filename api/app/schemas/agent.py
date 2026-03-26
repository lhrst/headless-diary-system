from __future__ import annotations

import uuid
import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AgentDispatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry_id: uuid.UUID
    command: str


class AgentTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entry_id: uuid.UUID
    command: str
    task_type: str = "chat"
    status: str
    result: Any | None = None
    error: str | None = None
    result_comment_id: uuid.UUID | None = None
    created_at: datetime.datetime
    completed_at: datetime.datetime | None = None
