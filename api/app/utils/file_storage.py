"""File-system helpers for diary markdown files."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path


def save_diary_file(
    user_id: str,
    entry_id: str,
    content: str,
    base_path: str,
) -> str:
    """Persist diary content as a .md file.

    Storage layout: ``{base_path}/{user_id}/{YYYY}/{MM}/{entry_id}.md``

    Returns the *relative* path from ``base_path`` (suitable for DB storage).
    """
    now = datetime.now(timezone.utc)
    rel_dir = os.path.join(user_id, now.strftime("%Y"), now.strftime("%m"))
    rel_path = os.path.join(rel_dir, f"{entry_id}.md")
    full_path = Path(base_path) / rel_path

    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")

    return rel_path


def read_diary_file(content_path: str, base_path: str) -> str:
    """Read and return the contents of a diary .md file."""
    full_path = Path(base_path) / content_path
    return full_path.read_text(encoding="utf-8")


def delete_diary_file(content_path: str, base_path: str) -> None:
    """Delete a diary .md file if it exists."""
    full_path = Path(base_path) / content_path
    full_path.unlink(missing_ok=True)
