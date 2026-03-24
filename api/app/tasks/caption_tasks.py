"""Media captioning tasks: photo, audio, video."""
import base64
import json
import os
import subprocess
import httpx

from app.tasks import celery_app
from app.config import settings
from app.database import sync_session_factory
from app.models.media import DiaryMedia


def _load_image_base64(file_path: str) -> str:
    """Load image file and return base64 string."""
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _get_mime(file_path: str) -> str:
    """Get MIME type from file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".gif": "image/gif",
    }
    return mime_map.get(ext, "image/jpeg")


def _detect_language(text: str) -> str:
    """Simple language detection based on character ranges."""
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    if chinese_chars > len(text) * 0.1:
        return "zh"
    return "en"


@celery_app.task(bind=True, max_retries=2, time_limit=60)
def caption_photo(self, media_id: str):
    """Generate text description for a photo using Claude Vision via OpenRouter."""
    db = sync_session_factory()
    try:
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if not media:
            return

        media.media_text_status = "processing"
        db.commit()

        image_data = _load_image_base64(media.file_path)
        mime_type = _get_mime(media.file_path)

        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "anthropic/claude-3.5-haiku",
                    "messages": [{
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_data}",
                                },
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Describe this image concisely for a personal diary. "
                                    "Include: what's shown, any readable text (OCR), "
                                    "notable details (people count, location cues, objects). "
                                    "Respond in the same language as any text in the image, "
                                    "default to Chinese if no text detected. "
                                    "Format:\n"
                                    "Description: (1-2 sentences)\n"
                                    "Text in image: (any readable text, or 'None')\n"
                                    "Tags: (3-5 suggested tags, comma-separated)"
                                ),
                            },
                        ],
                    }],
                    "max_tokens": 500,
                },
            )
            response.raise_for_status()
            result = response.json()

        result_text = result["choices"][0]["message"]["content"]
        tokens_used = result.get("usage", {}).get("completion_tokens", 0)

        media.media_text = result_text
        media.media_text_lang = _detect_language(result_text)
        media.media_text_status = "done"
        media.media_text_method = "claude-vision"
        media.media_text_metadata = {
            "model": "claude-haiku-4-5-20251001",
            "tokens_used": tokens_used,
            "has_ocr": "None" not in result_text.split("Text in image:")[-1][:20] if "Text in image:" in result_text else False,
        }
        db.commit()

    except Exception as e:
        db.rollback()
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if media:
            media.media_text_status = "failed"
            db.commit()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, time_limit=600)
def transcribe_audio(self, media_id: str):
    """Transcribe audio using faster-whisper (local)."""
    db = sync_session_factory()
    try:
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if not media:
            return

        media.media_text_status = "processing"
        db.commit()

        try:
            from faster_whisper import WhisperModel

            model = WhisperModel(
                settings.WHISPER_MODEL_SIZE,
                device=settings.WHISPER_DEVICE,
                compute_type="auto",
            )

            segments, info = model.transcribe(
                media.file_path,
                beam_size=5,
                language=None,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )

            transcript_parts = [segment.text.strip() for segment in segments]
            full_transcript = "\n".join(transcript_parts)

            media.media_text = full_transcript
            media.media_text_lang = info.language
            media.media_text_status = "done"
            media.media_text_method = "whisper"
            media.media_text_metadata = {
                "model_size": settings.WHISPER_MODEL_SIZE,
                "duration_s": info.duration,
                "language_probability": round(info.language_probability, 2),
            }
            db.commit()

        except ImportError:
            # faster-whisper not available, try cloud fallback
            if settings.WHISPER_CLOUD_FALLBACK:
                transcribe_audio_cloud.delay(media_id)
            else:
                media.media_text_status = "failed"
                media.media_text_metadata = {"error": "faster-whisper not installed"}
                db.commit()

    except Exception as e:
        db.rollback()
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if media:
            media.media_text_status = "failed"
            db.commit()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=1, time_limit=300)
def transcribe_audio_cloud(self, media_id: str):
    """Fallback: transcribe via OpenAI Whisper API through OpenRouter."""
    db = sync_session_factory()
    try:
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if not media:
            return

        # Use OpenRouter's whisper endpoint or OpenAI directly
        with httpx.Client(timeout=300) as client:
            with open(media.file_path, "rb") as f:
                response = client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
                    files={"file": f},
                    data={"model": "whisper-1", "response_format": "text"},
                )
            if response.status_code == 200:
                media.media_text = response.text
                media.media_text_status = "done"
                media.media_text_method = "whisper-cloud"
                db.commit()
            else:
                media.media_text_status = "failed"
                media.media_text_metadata = {"error": f"Cloud transcription failed: {response.status_code}"}
                db.commit()

    except Exception as e:
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, time_limit=900)
def caption_video(self, media_id: str):
    """Video captioning: keyframes + audio transcript."""
    db = sync_session_factory()
    try:
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if not media:
            return

        media.media_text_status = "processing"
        db.commit()

        video_path = media.file_path

        # Step 1: Extract keyframes
        keyframes = _extract_keyframes(video_path, str(media.id))

        # Step 2: Caption each keyframe via Vision
        frame_captions = []
        for kf in keyframes:
            image_data = _load_image_base64(kf["path"])
            ts = _format_timestamp(kf["timestamp_s"])

            with httpx.Client(timeout=60) as client:
                response = client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "anthropic/claude-3.5-haiku",
                        "messages": [{
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{image_data}",
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": (
                                        "Describe this video frame in one sentence. "
                                        "Include any readable text. "
                                        "Respond in Chinese unless the content is clearly in another language."
                                    ),
                                },
                            ],
                        }],
                        "max_tokens": 200,
                    },
                )
                response.raise_for_status()
                result = response.json()

            caption = result["choices"][0]["message"]["content"].strip()
            frame_captions.append(f"[{ts}] {caption}")

        # Step 3: Extract and transcribe audio track
        audio_path = _extract_audio_track(video_path, str(media.id))
        audio_transcript = ""

        if audio_path and _has_audio_content(audio_path):
            try:
                from faster_whisper import WhisperModel
                model = WhisperModel(settings.WHISPER_MODEL_SIZE, device=settings.WHISPER_DEVICE, compute_type="auto")
                segments, info = model.transcribe(audio_path, beam_size=5, vad_filter=True)
                audio_transcript = "\n".join(seg.text.strip() for seg in segments)
            except ImportError:
                pass

        # Step 4: Merge into unified text
        parts = []
        if frame_captions:
            parts.append("Visual content:\n" + "\n".join(frame_captions))
        if audio_transcript:
            parts.append("Audio transcript:\n" + audio_transcript)

        media.media_text = "\n\n".join(parts) if parts else "No content extracted"
        media.media_text_lang = _detect_language(media.media_text)
        media.media_text_status = "done"
        media.media_text_method = "vision+whisper"
        media.media_text_metadata = {
            "keyframe_count": len(keyframes),
            "has_audio": bool(audio_transcript),
            "audio_duration_s": media.duration_ms / 1000 if media.duration_ms else None,
        }
        db.commit()

        # Clean up temp audio file
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)

    except Exception as e:
        db.rollback()
        media = db.query(DiaryMedia).filter(DiaryMedia.id == media_id).first()
        if media:
            media.media_text_status = "failed"
            db.commit()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


def _extract_keyframes(video_path: str, media_id: str, max_frames: int = 8) -> list[dict]:
    """Extract representative keyframes from a video using ffmpeg."""
    output_dir = os.path.join(os.path.dirname(video_path), f"{media_id}_keyframes")
    os.makedirs(output_dir, exist_ok=True)

    # Get video duration
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True,
    )
    try:
        duration = float(json.loads(probe.stdout)["format"]["duration"])
    except (json.JSONDecodeError, KeyError):
        duration = 60.0

    # Uniform sampling
    interval = duration / (max_frames + 1)
    keyframes = []
    for i in range(max_frames):
        ts = interval * (i + 1)
        out_path = os.path.join(output_dir, f"{i+1:04d}.jpg")
        subprocess.run([
            "ffmpeg", "-ss", str(ts), "-i", video_path,
            "-frames:v", "1", "-q:v", "2", out_path,
            "-y", "-loglevel", "quiet",
        ])
        if os.path.exists(out_path):
            keyframes.append({"path": out_path, "timestamp_s": round(ts, 1)})

    return keyframes


def _extract_audio_track(video_path: str, media_id: str) -> str | None:
    """Extract audio track from video as mp3."""
    audio_path = f"/tmp/{media_id}_audio.mp3"
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-vn", "-acodec", "libmp3lame",
         "-q:a", "4", audio_path, "-y", "-loglevel", "quiet"],
        capture_output=True,
    )
    if result.returncode == 0 and os.path.exists(audio_path) and os.path.getsize(audio_path) > 1000:
        return audio_path
    return None


def _has_audio_content(audio_path: str) -> bool:
    """Check if audio file has actual content."""
    result = subprocess.run(
        ["ffmpeg", "-i", audio_path, "-af", "silencedetect=n=-40dB:d=2",
         "-f", "null", "-", "-loglevel", "info"],
        capture_output=True, text=True,
    )
    return "silence_end" in result.stderr


def _format_timestamp(seconds: float) -> str:
    """Format seconds to MM:SS."""
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"
