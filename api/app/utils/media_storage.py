"""Media storage abstraction with local filesystem backend."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from PIL import Image

from app.config import settings

# Try to import pillow-heif for HEIC support; optional at import time.
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    _HEIF_AVAILABLE = True
except ImportError:
    _HEIF_AVAILABLE = False

_THUMB_WIDTH = 400
_THUMB_FORMAT = "WEBP"


class LocalMediaStorage:
    """Store media files on the local filesystem."""

    def __init__(self, base_path: str | None = None) -> None:
        self.base_path = Path(base_path or settings.MEDIA_STORAGE_PATH)

    # ── helpers ──────────────────────────────────────────────────

    def _build_rel_dir(self, user_id: str) -> str:
        now = datetime.now(timezone.utc)
        return os.path.join(user_id, now.strftime("%Y"), now.strftime("%m"))

    def _full_path(self, rel: str) -> Path:
        return self.base_path / rel

    @staticmethod
    def _extension_from_content_type(content_type: str | None, filename: str | None) -> str:
        if filename:
            _, ext = os.path.splitext(filename)
            if ext:
                return ext.lower()
        mapping = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/heic": ".heic",
            "image/heif": ".heif",
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
            "audio/mpeg": ".mp3",
            "audio/wav": ".wav",
            "audio/ogg": ".ogg",
            "audio/mp4": ".m4a",
        }
        return mapping.get(content_type or "", ".bin")

    # ── public API ───────────────────────────────────────────────

    async def save(
        self,
        user_id: str,
        file: UploadFile,
        media_type: str,
    ) -> dict[str, Any]:
        """Save an uploaded file and return metadata dict.

        Returns dict with keys:
            file_path, thumb_path, mime_type, file_size, width, height, duration_ms
        """
        media_id = str(uuid.uuid4())
        ext = self._extension_from_content_type(file.content_type, file.filename)
        rel_dir = self._build_rel_dir(user_id)
        rel_path = os.path.join(rel_dir, f"{media_id}{ext}")
        full = self._full_path(rel_path)
        full.parent.mkdir(parents=True, exist_ok=True)

        # Read file content
        data = await file.read()
        full.write_bytes(data)

        file_size = len(data)
        width: int | None = None
        height: int | None = None
        duration_ms: int | None = None
        thumb_path: str | None = None
        mime_type = file.content_type or "application/octet-stream"

        # Process images
        if media_type == "photo":
            try:
                img = Image.open(full)
                width, height = img.size

                # Convert HEIC to WebP
                is_heic = ext in (".heic", ".heif")
                if is_heic:
                    webp_rel = os.path.join(rel_dir, f"{media_id}.webp")
                    webp_full = self._full_path(webp_rel)
                    img.save(webp_full, format="WEBP")
                    # Remove original HEIC
                    full.unlink(missing_ok=True)
                    rel_path = webp_rel
                    full = webp_full
                    mime_type = "image/webp"

                # Generate thumbnail
                thumb_rel = os.path.join(rel_dir, f"{media_id}_thumb.webp")
                thumb_full = self._full_path(thumb_rel)
                thumb = img.copy()
                ratio = _THUMB_WIDTH / thumb.width
                thumb_height = int(thumb.height * ratio)
                thumb = thumb.resize((_THUMB_WIDTH, thumb_height), Image.LANCZOS)
                thumb.save(thumb_full, format=_THUMB_FORMAT)
                thumb_path = thumb_rel
            except Exception:
                pass  # Non-fatal; metadata may be incomplete

        return {
            "media_id": media_id,
            "file_path": rel_path,
            "thumb_path": thumb_path,
            "mime_type": mime_type,
            "file_size": file_size,
            "width": width,
            "height": height,
            "duration_ms": duration_ms,
        }

    def get_url(self, media_id: str) -> str:
        """Return the public URL for a stored media file."""
        return f"/media/{media_id}"

    def get_thumbnail_url(self, media_id: str) -> str:
        """Return the public URL for a media thumbnail."""
        return f"/media/{media_id}/thumbnail"

    def get_local_path(self, file_path: str) -> str:
        """Return the absolute local filesystem path for a relative file_path."""
        return str(self._full_path(file_path))

    async def delete(self, media_id: str) -> None:
        """Delete media and its thumbnail from storage.

        Scans the storage tree for files matching the media_id prefix.
        """
        for path in self.base_path.rglob(f"{media_id}*"):
            path.unlink(missing_ok=True)
