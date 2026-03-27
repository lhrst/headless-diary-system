"""Media routes."""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.media import DiaryMedia
from app.models.user import User
from app.schemas.media import MediaInfoResponse, MediaUpdateRequest, MediaUploadResponse
from app.utils.media_storage import LocalMediaStorage

router = APIRouter(prefix="/media", tags=["media"])

_storage = LocalMediaStorage()

# ── size limits (bytes) ──────────────────────────────────────────
_TYPE_LIMITS: dict[str, int] = {
    "photo": settings.MEDIA_MAX_PHOTO_MB * 1024 * 1024,
    "video": settings.MEDIA_MAX_VIDEO_MB * 1024 * 1024,
    "audio": settings.MEDIA_MAX_AUDIO_MB * 1024 * 1024,
}

_MIME_TO_TYPE: dict[str, str] = {
    "image/jpeg": "photo", "image/png": "photo", "image/webp": "photo",
    "image/heic": "photo", "image/heif": "photo", "image/gif": "photo",
    "video/mp4": "video", "video/quicktime": "video", "video/webm": "video",
    "video/x-msvideo": "video", "video/x-matroska": "video",
    "audio/mpeg": "audio", "audio/mp3": "audio",
    "audio/wav": "audio", "audio/x-wav": "audio", "audio/wave": "audio",
    "audio/ogg": "audio", "audio/mp4": "audio", "audio/m4a": "audio",
    "audio/x-m4a": "audio", "audio/webm": "audio", "audio/flac": "audio",
}

_EXT_TO_TYPE: dict[str, str] = {
    ".jpg": "photo", ".jpeg": "photo", ".png": "photo", ".webp": "photo",
    ".heic": "photo", ".gif": "photo",
    ".mp4": "video", ".mov": "video", ".webm": "video", ".avi": "video",
    ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio",
    ".flac": "audio", ".aac": "audio",
}


def _detect_media_type(content_type: str | None, filename: str | None = None) -> str:
    if content_type and content_type in _MIME_TO_TYPE:
        return _MIME_TO_TYPE[content_type]
    # Fallback to extension
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext in _EXT_TO_TYPE:
            return _EXT_TO_TYPE[ext]
    return "photo"


async def _get_media_or_404(
    media_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> DiaryMedia:
    result = await db.execute(
        select(DiaryMedia).where(
            DiaryMedia.id == media_id,
            DiaryMedia.user_id == current_user.id,
        )
    )
    media = result.scalar_one_or_none()
    if media is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found",
        )
    return media


@router.post("/upload", response_model=MediaUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    entry_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media_type = _detect_media_type(file.content_type, file.filename)

    # Save to filesystem
    meta = await _storage.save(
        user_id=str(current_user.id),
        file=file,
        media_type=media_type,
    )

    # Check size limit
    limit = _TYPE_LIMITS.get(media_type)
    if limit and meta["file_size"] > limit:
        # Clean up saved file
        await _storage.delete(meta["media_id"])
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for type {media_type}",
        )

    record = DiaryMedia(
        id=uuid.UUID(meta["media_id"]),
        entry_id=entry_id,
        user_id=current_user.id,
        media_type=media_type,
        original_name=file.filename,
        file_path=meta["file_path"],
        thumb_path=meta["thumb_path"],
        mime_type=meta["mime_type"],
        file_size=meta["file_size"],
        width=meta["width"],
        height=meta["height"],
        duration_ms=meta["duration_ms"],
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    url = f"/api/v1/media/{record.id}/file"
    thumb_url = f"/api/v1/media/{record.id}/thumb" if record.thumb_path else None
    ext = os.path.splitext(meta["file_path"])[1]
    md_embed = f"![{file.filename or 'media'}]({url})" if media_type == "photo" else f"[{file.filename or 'media'}]({url})"

    # Run captioning inline (sync) for photos; queue others
    if media_type == "photo":
        try:
            import base64, httpx
            from app.config import settings as _s
            file_abs = _storage.get_local_path(record.file_path)
            with open(file_abs, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode()
            mime = record.mime_type or "image/jpeg"
            record.media_text_status = "processing"
            await db.flush()
            with httpx.Client(timeout=60, proxy=None) as client:
                resp = client.post(
                    f"{_s.OPENROUTER_BASE_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {_s.OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": settings.LLM_MODEL_FAST,
                        "messages": [{"role": "user", "content": [
                            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
                            {"type": "text", "text": "Describe this image concisely for a personal diary. Include: what's shown, any readable text (OCR), notable details. Respond in Chinese. Format:\nDescription: (1-2 sentences)\nText in image: (any readable text, or 'None')\nTags: (3-5 suggested tags, comma-separated)"},
                        ]}],
                        "max_tokens": 500,
                    },
                )
                resp.raise_for_status()
                caption = resp.json()["choices"][0]["message"]["content"]
                record.media_text = caption
                record.media_text_status = "done"
                record.media_text_method = "vision-inline"
                await db.flush()
                await db.refresh(record)
        except Exception:
            import traceback; traceback.print_exc()
            record.media_text_status = "failed"
            await db.flush()

    return MediaUploadResponse(
        id=record.id,
        media_type=record.media_type,
        original_name=record.original_name or "",
        file_size=record.file_size,
        url=url,
        thumb_url=thumb_url,
        media_text_status=record.media_text_status,
        markdown_embed=md_embed,
    )


@router.get("/{media_id}/file")
async def get_media_file(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serve media file. No auth required — UUID is unguessable."""
    result = await db.execute(select(DiaryMedia).where(DiaryMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    local_path = _storage.get_local_path(media.file_path)
    if not os.path.isfile(local_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return FileResponse(
        path=local_path,
        media_type=media.mime_type,
        filename=media.original_name,
    )


@router.get("/{media_id}/thumb")
async def get_media_thumb(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serve thumbnail. No auth required — UUID is unguessable."""
    result = await db.execute(select(DiaryMedia).where(DiaryMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    if not media.thumb_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not available")

    local_path = _storage.get_local_path(media.thumb_path)
    if not os.path.isfile(local_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail file not found on disk")

    return FileResponse(path=local_path, media_type="image/webp")


@router.get("/{media_id}/info", response_model=MediaInfoResponse)
async def get_media_info(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = await _get_media_or_404(media_id, db, current_user)
    return MediaInfoResponse(
        id=media.id,
        media_type=media.media_type,
        duration_ms=media.duration_ms,
        width=media.width,
        height=media.height,
        media_text_status=media.media_text_status,
        media_text_method=media.media_text_method,
        media_text=media.media_text,
        media_text_metadata=media.media_text_metadata,
    )


@router.get("/{media_id}/text")
async def get_media_text(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = await _get_media_or_404(media_id, db, current_user)
    return {
        "media_id": str(media.id),
        "media_text_status": media.media_text_status,
        "media_text": media.media_text,
    }


@router.put("/{media_id}", response_model=MediaUploadResponse)
async def update_media(
    media_id: uuid.UUID,
    body: MediaUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = await _get_media_or_404(media_id, db, current_user)

    if body.entry_id is not None:
        media.entry_id = body.entry_id
    if body.original_name is not None:
        media.original_name = body.original_name

    await db.flush()
    await db.refresh(media)

    url = f"/api/v1/media/{media.id}/file"
    thumb_url = f"/api/v1/media/{media.id}/thumb" if media.thumb_path else None
    md_embed = (
        f"![{media.original_name or 'media'}]({url})"
        if media.media_type == "photo"
        else f"[{media.original_name or 'media'}]({url})"
    )

    return MediaUploadResponse(
        id=media.id,
        media_type=media.media_type,
        original_name=media.original_name or "",
        file_size=media.file_size,
        url=url,
        thumb_url=thumb_url,
        media_text_status=media.media_text_status,
        markdown_embed=md_embed,
    )


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = await _get_media_or_404(media_id, db, current_user)

    # Delete files from disk
    await _storage.delete(str(media.id))

    await db.delete(media)
    await db.flush()


@router.get("", response_model=list[MediaUploadResponse])
async def list_media(
    entry_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(DiaryMedia).where(DiaryMedia.user_id == current_user.id)
    if entry_id is not None:
        query = query.where(DiaryMedia.entry_id == entry_id)
    query = query.order_by(DiaryMedia.created_at.desc())

    result = await db.execute(query)
    media_list = result.scalars().all()

    responses = []
    for m in media_list:
        url = f"/api/v1/media/{m.id}/file"
        thumb_url = f"/api/v1/media/{m.id}/thumb" if m.thumb_path else None
        md_embed = (
            f"![{m.original_name or 'media'}]({url})"
            if m.media_type == "photo"
            else f"[{m.original_name or 'media'}]({url})"
        )
        responses.append(
            MediaUploadResponse(
                id=m.id,
                media_type=m.media_type,
                original_name=m.original_name or "",
                file_size=m.file_size,
                url=url,
                thumb_url=thumb_url,
                media_text_status=m.media_text_status,
                markdown_embed=md_embed,
            )
        )
    return responses


@router.post("/{media_id}/recaption")
async def recaption_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = await _get_media_or_404(media_id, db, current_user)

    # Reset caption status so background worker picks it up
    media.media_text_status = "pending"
    media.media_text = None
    media.media_text_method = None
    media.media_text_metadata = None
    await db.flush()
    await db.refresh(media)

    # Dispatch captioning task
    try:
        from app.tasks.caption_tasks import caption_photo, transcribe_audio, caption_video
        task_map = {
            "photo": caption_photo,
            "audio": transcribe_audio,
            "video": caption_video,
        }
        task_fn = task_map.get(media.media_type)
        if task_fn:
            task_fn.delay(str(media.id))
    except Exception:
        pass

    # Run inline captioning for photos
    if media.media_type == "photo":
        try:
            import base64, httpx
            from app.config import settings as _s
            file_abs = _storage.get_local_path(media.file_path)
            with open(file_abs, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode()
            mime = media.mime_type or "image/jpeg"
            media.media_text_status = "processing"
            await db.flush()
            with httpx.Client(timeout=60, proxy=None) as client:
                resp = client.post(
                    f"{_s.OPENROUTER_BASE_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {_s.OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": settings.LLM_MODEL_FAST,
                        "messages": [{"role": "user", "content": [
                            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
                            {"type": "text", "text": "Describe this image concisely for a diary. Include readable text. Respond in Chinese.\nDescription: (1-2 sentences)\nText in image: (any readable text, or 'None')\nTags: (3-5 tags)"},
                        ]}],
                        "max_tokens": 500,
                    },
                )
                resp.raise_for_status()
                media.media_text = resp.json()["choices"][0]["message"]["content"]
                media.media_text_status = "done"
                media.media_text_method = "vision-inline"
                await db.flush()
        except Exception:
            media.media_text_status = "failed"
            await db.flush()

    return {
        "media_id": str(media.id),
        "media_text_status": media.media_text_status,
        "media_text": media.media_text,
        "message": "Recaption completed" if media.media_text_status == "done" else "Recaption failed",
    }


@router.put("/{media_id}/text")
async def update_media_text(
    media_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit the generated media text (transcript/caption)."""
    media = await _get_media_or_404(media_id, db, current_user)
    media.media_text = body.get("media_text", media.media_text)
    media.media_text_method = (media.media_text_method or "") + "+edited"
    await db.flush()
    return {
        "media_id": str(media.id),
        "media_text": media.media_text,
        "media_text_status": media.media_text_status,
    }
