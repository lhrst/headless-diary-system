"""Title generation heuristics.

Does NOT contain any LLM call logic — that lives in the Celery tasks layer.
"""

from __future__ import annotations

import hashlib


def _content_hash(content: str) -> str:
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def _hash_similarity(h1: str, h2: str) -> float:
    """Character-level similarity between two hex digests (0.0-1.0)."""
    matches = sum(a == b for a, b in zip(h1, h2))
    return matches / max(len(h1), len(h2))


async def should_regenerate_title(
    entry,  # DiaryEntry — kept untyped to avoid circular import
    new_content: str,
) -> bool:
    """Decide whether the auto-title should be regenerated.

    Returns ``True`` when:
    - The entry has no ``auto_title`` yet, OR
    - The content hash changed significantly (similarity < 70%).
    """

    if not entry.auto_title:
        return True

    if not entry.content_hash:
        return True

    new_hash = _content_hash(new_content)
    similarity = _hash_similarity(entry.content_hash, new_hash)
    return similarity < 0.70
