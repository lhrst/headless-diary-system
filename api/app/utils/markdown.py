"""Markdown parsing utilities for diary entries."""

from __future__ import annotations

import re

# ── Pre-compiled patterns ────────────────────────────────────────────
_CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```|`[^`]+`")
_HEADING_RE = re.compile(r"^#{1,6}\s", re.MULTILINE)
_TAG_RE = re.compile(r"(?<!\w)#([\w\u4e00-\u9fff]{1,50})(?!\w)")
_REFERENCE_RE = re.compile(r"\[\[([^\]]+)\]\]")
_AGENT_CMD_RE = re.compile(r"@agent\s+(.+?)(?:\n|$)")
_MEDIA_EMBED_RE = re.compile(r"!\[([^\]]*)\]\(media://([a-f0-9-]+)\)")


def _strip_code_blocks(content: str) -> str:
    """Remove inline code and fenced code blocks so they are not parsed."""
    return _CODE_BLOCK_RE.sub("", content)


def _strip_headings(content: str) -> str:
    """Remove heading lines (lines starting with # ) to avoid false-positive tags."""
    return "\n".join(
        line for line in content.splitlines()
        if not _HEADING_RE.match(line)
    )


# ── Public API ───────────────────────────────────────────────────────

def extract_tags(content: str) -> list[str]:
    """Extract #hashtag style tags, ignoring code blocks and headings.

    Returns deduplicated list preserving first-occurrence order.
    """
    cleaned = _strip_headings(_strip_code_blocks(content))
    seen: set[str] = set()
    result: list[str] = []
    for tag in _TAG_RE.findall(cleaned):
        if tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result


def extract_references(content: str) -> list[str]:
    """Extract [[wiki-link]] style references."""
    return _REFERENCE_RE.findall(content)


def extract_agent_commands(content: str) -> list[str]:
    """Extract @agent commands from content."""
    return _AGENT_CMD_RE.findall(content)


def extract_media_embeds(content: str) -> list[str]:
    """Extract media embed UUIDs from ![alt](media://uuid) syntax."""
    return [match[1] for match in _MEDIA_EMBED_RE.findall(content)]
