# Diary System — Multimedia Supplement v2 (SPEC-MULTIMEDIA.md)

> This supplements the main SPEC.md. Merge into the corresponding sections when implementing.
> v2: Unified media captioning — all media types auto-generate searchable text.

---

## 1. Core Principle: Every Media Has Text

| Type | Auto-generated text | Method | Stored in |
|------|-------------------|--------|-----------|
| Audio | Full transcript | faster-whisper (local) | `diary_media.media_text` |
| Photo | Visual description + OCR | Claude Vision API | `diary_media.media_text` |
| Video | Keyframe descriptions + audio transcript | Vision + whisper | `diary_media.media_text` |

**All `media_text` is indexed for full-text search.** When you search "牙冠模型"，it finds:
- Diary text containing "牙冠模型"
- Photos where the caption says "3D牙冠模型的屏幕截图"
- Videos where a keyframe shows a dental crown model
- Audio recordings where you said "牙冠模型"

---

## 2. Supported Media Types

| Type | Formats | Max Size | Notes |
|------|---------|----------|-------|
| Photo | jpg, png, webp, heic | 20MB | HEIC auto-converted to webp on upload |
| Video | mp4, mov, webm | 500MB | Transcoded to mp4 (H.264) for universal playback |
| Audio | mp3, m4a, wav, ogg, webm | 100MB | Auto-transcribed to text |

---

## 3. Storage Architecture

```
data/
├── diaries/          # .md files (existing)
└── media/            # Uploaded media
    └── {user_id}/
        └── {YYYY}/{MM}/
            ├── {media_id}.webp              # Photo (converted)
            ├── {media_id}_thumb.webp        # Photo thumbnail (400px wide)
            ├── {media_id}.mp4               # Video (transcoded)
            ├── {media_id}_thumb.jpg         # Video thumbnail (first frame)
            ├── {media_id}_keyframes/        # Video keyframes directory
            │   ├── 0001.jpg                 # Keyframe at scene change
            │   ├── 0002.jpg
            │   └── ...
            ├── {media_id}.mp3               # Audio (original or converted)
            └── {media_id}.json              # Metadata cache
```

**Storage abstraction** (`app/utils/media_storage.py`):

```python
class MediaStorage(Protocol):
    async def save(self, user_id: str, file: UploadFile, media_type: str) -> MediaRecord
    async def get_url(self, media_id: str) -> str
    async def get_thumbnail_url(self, media_id: str) -> str
    async def delete(self, media_id: str) -> None
```

Default: `LocalMediaStorage` writes to `data/media/`.
Optional: `S3MediaStorage` for production with large media volumes.

---

## 4. Database Schema

```sql
CREATE TABLE diary_media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID REFERENCES diary_entries(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_type      VARCHAR(10) NOT NULL,       -- 'photo' | 'video' | 'audio'
    original_name   VARCHAR(255),
    file_path       VARCHAR(500) NOT NULL,
    thumb_path      VARCHAR(500),
    mime_type       VARCHAR(100) NOT NULL,
    file_size       BIGINT NOT NULL,            -- Bytes
    width           INT,                        -- Photo + video
    height          INT,                        -- Photo + video
    duration_ms     BIGINT,                     -- Audio + video

    -- Unified text representation (replaces old "transcript" field)
    media_text          TEXT,                   -- Generated text description / transcript
    media_text_lang     VARCHAR(10),            -- Detected language
    media_text_status   VARCHAR(20) DEFAULT 'pending',  -- 'pending'|'processing'|'done'|'failed'
    media_text_method   VARCHAR(50),            -- 'whisper' | 'claude-vision' | 'vision+whisper'
    media_text_metadata JSONB,                  -- Extra: {keyframe_count, ocr_detected, confidence, ...}

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_media_entry ON diary_media(entry_id);
CREATE INDEX idx_media_user ON diary_media(user_id);
CREATE INDEX idx_media_type ON diary_media(media_type);
CREATE INDEX idx_media_text_status ON diary_media(media_text_status);

-- Full-text search across all media text
CREATE INDEX idx_media_text_fts ON diary_media
    USING gin(to_tsvector('simple', COALESCE(media_text, '')));
```

---

## 5. Auto-Captioning Pipeline

### 5.1 Photo → Caption + OCR

```python
# app/tasks/caption_tasks.py

@celery_app.task(bind=True, max_retries=2, time_limit=60)
def caption_photo(self, media_id: str):
    """Generate text description for a photo using Claude Vision."""
    media = db.get(DiaryMedia, media_id)
    media.media_text_status = "processing"
    db.commit()

    try:
        image_data = load_image_base64(media.file_path)

        response = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": get_mime(media.file_path),
                            "data": image_data,
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
        )

        result = response.content[0].text

        media.media_text = result
        media.media_text_lang = detect_language(result)
        media.media_text_status = "done"
        media.media_text_method = "claude-vision"
        media.media_text_metadata = {
            "model": "claude-haiku-4-5-20251001",
            "tokens_used": response.usage.output_tokens,
            "has_ocr": "None" not in result.split("Text in image:")[-1][:20],
        }
        db.commit()

        # Update diary full-text index
        update_diary_search_index(media.entry_id)

    except Exception as e:
        media.media_text_status = "failed"
        db.commit()
        raise self.retry(exc=e, countdown=30)
```

### 5.2 Audio → Transcript

```python
@celery_app.task(bind=True, max_retries=2, time_limit=600)
def transcribe_audio(self, media_id: str):
    """Transcribe audio using faster-whisper (local)."""
    media = db.get(DiaryMedia, media_id)
    media.media_text_status = "processing"
    db.commit()

    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(
            config.WHISPER_MODEL_SIZE,   # default: "medium"
            device="auto",               # cuda if available, else cpu
            compute_type="auto",         # float16 on GPU, int8 on CPU
        )

        audio_path = media_storage.get_local_path(media.file_path)

        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            language=None,               # Auto-detect
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())

        full_transcript = "\n".join(transcript_parts)

        media.media_text = full_transcript
        media.media_text_lang = info.language
        media.media_text_status = "done"
        media.media_text_method = "whisper"
        media.media_text_metadata = {
            "model_size": config.WHISPER_MODEL_SIZE,
            "duration_s": info.duration,
            "language_probability": round(info.language_probability, 2),
        }
        db.commit()

        update_diary_search_index(media.entry_id)

    except Exception as e:
        media.media_text_status = "failed"
        db.commit()

        if config.WHISPER_CLOUD_FALLBACK:
            transcribe_audio_cloud.delay(media_id)
        else:
            raise self.retry(exc=e, countdown=60)


@celery_app.task(bind=True, max_retries=1, time_limit=300)
def transcribe_audio_cloud(self, media_id: str):
    """Fallback: transcribe via OpenAI Whisper API."""
    media = db.get(DiaryMedia, media_id)

    import openai
    client = openai.OpenAI(api_key=config.OPENAI_API_KEY)

    with open(media_storage.get_local_path(media.file_path), "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text",
        )

    media.media_text = result
    media.media_text_status = "done"
    media.media_text_method = "whisper-cloud"
    db.commit()

    update_diary_search_index(media.entry_id)
```

### 5.3 Video → Keyframes + Audio → Combined Text

Video is the most complex: it has both visual and audio content.

```python
@celery_app.task(bind=True, max_retries=2, time_limit=900)
def caption_video(self, media_id: str):
    """
    Video captioning: extract keyframes + audio track,
    caption frames via Vision, transcribe audio via Whisper,
    merge into unified text.
    """
    media = db.get(DiaryMedia, media_id)
    media.media_text_status = "processing"
    db.commit()

    try:
        video_path = media_storage.get_local_path(media.file_path)

        # ── Step 1: Extract keyframes via scene detection ──
        keyframes = extract_keyframes(
            video_path,
            media_id=media.id,
            max_frames=8,              # Cap at 8 keyframes to control API cost
            method="scene_change",     # Detect scene transitions via ffmpeg
            min_interval_s=3,          # At least 3s between frames
        )
        # keyframes = [
        #   {"path": "/data/media/.../keyframes/0001.jpg", "timestamp_s": 0.0},
        #   {"path": "/data/media/.../keyframes/0002.jpg", "timestamp_s": 12.4},
        #   ...
        # ]

        # ── Step 2: Caption each keyframe via Claude Vision ──
        frame_captions = []
        for kf in keyframes:
            image_data = load_image_base64(kf["path"])
            ts = format_timestamp(kf["timestamp_s"])

            response = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_data,
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
            )
            caption = response.content[0].text.strip()
            frame_captions.append(f"[{ts}] {caption}")

        # ── Step 3: Extract and transcribe audio track ──
        audio_path = extract_audio_track(video_path, media_id=media.id)
        audio_transcript = ""

        if audio_path and has_audio_content(audio_path):
            from faster_whisper import WhisperModel
            model = WhisperModel(config.WHISPER_MODEL_SIZE, device="auto", compute_type="auto")
            segments, info = model.transcribe(audio_path, beam_size=5, vad_filter=True)
            audio_transcript = "\n".join(seg.text.strip() for seg in segments)

        # ── Step 4: Merge into unified text ──
        parts = []
        if frame_captions:
            parts.append("Visual content:\n" + "\n".join(frame_captions))
        if audio_transcript:
            parts.append("Audio transcript:\n" + audio_transcript)

        media.media_text = "\n\n".join(parts)
        media.media_text_lang = detect_language(media.media_text)
        media.media_text_status = "done"
        media.media_text_method = "vision+whisper"
        media.media_text_metadata = {
            "keyframe_count": len(keyframes),
            "has_audio": bool(audio_transcript),
            "audio_duration_s": media.duration_ms / 1000 if media.duration_ms else None,
        }
        db.commit()

        update_diary_search_index(media.entry_id)

    except Exception as e:
        media.media_text_status = "failed"
        db.commit()
        raise self.retry(exc=e, countdown=60)
```

### 5.4 Keyframe Extraction Helper

```python
# app/utils/video_processing.py

import subprocess
import json

def extract_keyframes(
    video_path: str,
    media_id: str,
    max_frames: int = 8,
    method: str = "scene_change",
    min_interval_s: float = 3.0,
) -> list[dict]:
    """
    Extract representative keyframes from a video.

    Method 'scene_change': uses ffmpeg scene detection filter.
    Method 'uniform': evenly spaced frames (fallback).
    """
    output_dir = get_keyframe_dir(media_id)
    os.makedirs(output_dir, exist_ok=True)

    # Get video duration
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True,
    )
    duration = float(json.loads(probe.stdout)["format"]["duration"])

    if method == "scene_change":
        # Use ffmpeg scene change detection
        # threshold 0.3 = moderate sensitivity
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"select='gt(scene,0.3)',showinfo",
            "-vsync", "vfr",
            "-frame_pts", "1",
            f"{output_dir}/%04d.jpg",
            "-y", "-loglevel", "info",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

        # Parse timestamps from ffmpeg showinfo output
        timestamps = parse_showinfo_timestamps(result.stderr)

        # Enforce minimum interval
        filtered = []
        last_ts = -min_interval_s
        for ts in timestamps:
            if ts - last_ts >= min_interval_s:
                filtered.append(ts)
                last_ts = ts

        # If scene detection got too few, supplement with uniform sampling
        if len(filtered) < 3:
            method = "uniform"

    if method == "uniform":
        # Evenly spaced frames
        interval = duration / (max_frames + 1)
        filtered = [interval * (i + 1) for i in range(max_frames)]

        for i, ts in enumerate(filtered):
            subprocess.run([
                "ffmpeg", "-ss", str(ts), "-i", video_path,
                "-frames:v", "1", "-q:v", "2",
                f"{output_dir}/{i+1:04d}.jpg",
                "-y", "-loglevel", "quiet",
            ])

    # Cap at max_frames (evenly pick if too many)
    if len(filtered) > max_frames:
        step = len(filtered) / max_frames
        filtered = [filtered[int(i * step)] for i in range(max_frames)]

    keyframes = []
    for i, ts in enumerate(filtered):
        path = f"{output_dir}/{i+1:04d}.jpg"
        if os.path.exists(path):
            keyframes.append({"path": path, "timestamp_s": round(ts, 1)})

    return keyframes


def extract_audio_track(video_path: str, media_id: str) -> str | None:
    """Extract audio track from video as mp3 for transcription."""
    audio_path = f"/tmp/{media_id}_audio.mp3"
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-vn", "-acodec", "libmp3lame",
         "-q:a", "4", audio_path, "-y", "-loglevel", "quiet"],
        capture_output=True,
    )
    if result.returncode == 0 and os.path.getsize(audio_path) > 1000:
        return audio_path
    return None


def has_audio_content(audio_path: str) -> bool:
    """Check if audio file has actual content (not just silence)."""
    result = subprocess.run(
        ["ffmpeg", "-i", audio_path, "-af", "silencedetect=n=-40dB:d=2",
         "-f", "null", "-", "-loglevel", "info"],
        capture_output=True, text=True,
    )
    # If silence covers >95% of duration, consider it empty
    return "silence_end" in result.stderr
```

---

## 6. Unified Search

The diary search endpoint now spans diary text + all media text:

```sql
-- In diary_service.py: search query

SELECT DISTINCT de.*
FROM diary_entries de
LEFT JOIN diary_media dm ON dm.entry_id = de.id
WHERE de.author_id = :user_id
  AND (
    to_tsvector('simple', de.raw_text) @@ plainto_tsquery('simple', :query)
    OR to_tsvector('simple', COALESCE(dm.media_text, '')) @@ plainto_tsquery('simple', :query)
  )
ORDER BY de.updated_at DESC
LIMIT :limit OFFSET :offset;
```

**Search response includes match source**:

```json
{
  "id": "diary-uuid",
  "title": "办公室考察",
  "match_sources": [
    {"type": "text", "preview": "...今天去看了新的办公室..."},
    {"type": "photo", "media_id": "photo-uuid", "preview": "Description: 宽敞的办公空间，有白色桌椅和大窗户"},
    {"type": "audio", "media_id": "audio-uuid", "preview": "...我觉得这个办公室的采光非常好..."}
  ]
}
```

---

## 7. API Endpoints

### 7.1 Upload

```
POST /api/v1/media/upload
Content-Type: multipart/form-data

Fields:
  file: <binary>
  entry_id: <uuid> (optional)
```

**Response** (immediate, captioning runs async):

```json
{
  "id": "media-uuid",
  "media_type": "photo",
  "original_name": "office-visit.jpg",
  "file_size": 3245678,
  "url": "/api/v1/media/media-uuid/file",
  "thumb_url": "/api/v1/media/media-uuid/thumb",
  "media_text_status": "pending",
  "markdown_embed": "![photo](media://media-uuid)"
}
```

### 7.2 Retrieve

```
GET /api/v1/media/{media_id}/file            # Full file (streamed, supports Range)
GET /api/v1/media/{media_id}/thumb           # Thumbnail
GET /api/v1/media/{media_id}/info            # Full metadata + media_text
GET /api/v1/media/{media_id}/text            # Just the generated text
```

**GET `/media/{id}/info` response**:

```json
{
  "id": "media-uuid",
  "media_type": "video",
  "duration_ms": 45000,
  "width": 1920,
  "height": 1080,
  "media_text_status": "done",
  "media_text_method": "vision+whisper",
  "media_text": "Visual content:\n[0:00] 会议室内，四人围坐在白板前讨论\n[0:12] 白板上画着牙冠设计的边缘线示意图\n[0:28] 屏幕展示3D模型软件界面\n\nAudio transcript:\n今天主要讨论三个问题，第一个是边缘线检测算法...",
  "media_text_metadata": {
    "keyframe_count": 5,
    "has_audio": true
  }
}
```

### 7.3 Manage

```
PUT    /api/v1/media/{media_id}              # Attach to entry, rename
DELETE /api/v1/media/{media_id}              # Delete media + files
GET    /api/v1/media?entry_id={uuid}         # List media for a diary entry
POST   /api/v1/media/{media_id}/recaption    # Re-run captioning
```

---

## 8. Markdown Embed Syntax & Rendering

### 8.1 Embed Syntax

```markdown
今天去看了新的办公室：

![办公室全景](media://photo-uuid-1)

录了一段讨论：
![会议录音](media://audio-uuid-1)

拍了个工位视频：
![工位视频](media://video-uuid-1)
```

### 8.2 Parsing

**Regex** (add to `app/utils/markdown.py`): `!\[([^\]]*)\]\(media://([a-f0-9-]+)\)`

### 8.3 Frontend Components

```
components/media/
├── MediaEmbed.tsx         # Router: detects type → renders correct sub-component
├── PhotoEmbed.tsx         # Image + caption below + lightbox on click
├── AudioEmbed.tsx         # Player + transcript (always visible together)
├── VideoEmbed.tsx         # Video player + combined text below
└── MediaTextBadge.tsx     # Status indicator (pending / processing / done)
```

**PhotoEmbed layout**:

```
┌───────────────────────────────────────┐
│                                       │
│              [Photo]                  │
│                                       │
├───────────────────────────────────────┤
│ 📷 宽敞的办公空间，有白色桌椅和大窗户  │
│ 🔤 Text: "WeWork · 上海静安"           │
│ 🏷️ #办公室 #选址                      │
│                          [🔄 Re-run]  │
└───────────────────────────────────────┘
```

- Caption always visible below the image
- OCR text shown separately if detected
- Suggested tags shown as clickable pills (click to add to diary)
- "Re-run" button to regenerate caption

**AudioEmbed layout**:

```
┌───────────────────────────────────────┐
│ ▶  ━━━━━━━●━━━━━━━━━━  1:23 / 3:02   │
│    0.5x  1x  [1.5x]  2x              │
├───────────────────────────────────────┤
│ 今天和贺翔讨论了牙冠边缘线的问题，    │
│ 主要有三个结论。第一，现有的边缘检测   │
│ 算法在后牙区域精度不够...              │
│                                       │
│           [📋 Copy]  [📝 Add to text]  │
└───────────────────────────────────────┘
```

- Player and transcript always visible together, no collapse
- Current sentence highlights during playback
- "Add to text" inserts transcript as blockquote into diary body

**VideoEmbed layout**:

```
┌───────────────────────────────────────┐
│                                       │
│            [Video Player]             │
│          ▶ ━━━━●━━━━━ 0:28/0:45      │
│                                       │
├───────────────────────────────────────┤
│ 📹 Visual:                            │
│   [0:00] 会议室内，四人围坐讨论        │
│   [0:12] 白板上的边缘线示意图          │
│   [0:28] 3D模型软件界面               │
│                                       │
│ 🔊 Audio:                             │
│   今天主要讨论三个问题，第一个是...    │
│                                       │
│           [📋 Copy]  [📝 Add to text]  │
└───────────────────────────────────────┘
```

- Keyframe timestamps are clickable → seek video to that point
- Visual and audio sections clearly separated
- Same copy/insert buttons as audio

---

## 9. Editor Upload UX

**Drag & drop / Paste / Toolbar button**:

1. User drops a file into TipTap editor
2. Detect file type → validate size
3. Insert inline placeholder: `⏳ Uploading office-photo.jpg...`
4. `POST /api/v1/media/upload` with the file
5. On upload success, replace placeholder with `![](media://returned-uuid)`
6. Component renders immediately (shows image/player)
7. Caption status shows as "Generating description..." badge
8. When captioning completes (poll or WebSocket), badge updates to show the text

**iOS**: `PHPickerViewController` for photos/videos, file picker or mic for audio. Same API flow.

**iOS Recording**: Toolbar mic button → `AVAudioRecorder` → upload on stop → transcript appears.

---

## 10. Agent Integration with Media

The agent system gains media awareness. Context building includes media text:

```python
# In agent_service.py build_context():

def build_context(command, entry_id):
    parts = [f"Current diary:\n{get_diary_content(entry_id)}"]

    # Include all media text for this entry
    media_list = get_media_by_entry(entry_id)
    for m in media_list:
        if m.media_text and m.media_text_status == "done":
            type_label = {"photo": "Photo description", "audio": "Audio transcript", "video": "Video content"}
            parts.append(f"\n[{type_label[m.media_type]}]:\n{m.media_text}\n")

    # For commands like "describe the photo", send image directly to Vision
    if needs_direct_vision(command):
        photos = [m for m in media_list if m.media_type == "photo"]
        for p in photos:
            image_data = load_image_base64(p.file_path)
            parts.append({"type": "image", "data": image_data})

    # ... existing tag/reference/weekly context logic ...

    return parts
```

**New agent capabilities**:

| Command | Action |
|---------|--------|
| `@agent 总结这条录音` | Use audio media_text → LLM summary |
| `@agent 描述这张照片的细节` | Send photo directly to Vision for detailed description |
| `@agent 这个视频讲了什么` | Use video media_text (keyframes + audio) → LLM summary |
| `@agent 把所有媒体内容整理成笔记` | Gather all media_text from entry → structure into notes |
| `@agent 对比这两张照片的区别` | Send both photos to Vision → comparison |

---

## 11. Cost Estimation

Per media item (rough estimate):

| Type | Processing | Cost |
|------|-----------|------|
| Photo caption | Haiku Vision, ~300 tokens out | ~$0.003 |
| Audio transcript (local) | faster-whisper on CPU | Free (compute only) |
| Audio transcript (cloud) | OpenAI Whisper API | ~$0.006/min |
| Video (5 keyframes + audio) | 5× Haiku Vision + Whisper | ~$0.02 |

For a typical diary with 3 photos and 1 audio clip per day: ~$0.01/day ≈ $0.30/month.

---

## 12. Dependencies

```toml
# api/pyproject.toml additions
[project.dependencies]
faster-whisper = ">=1.1.0"
python-multipart = ">=0.0.9"
Pillow = ">=10.0"
pillow-heif = ">=0.18"
ffmpeg-python = ">=0.2.0"

[project.optional-dependencies]
cloud = ["openai>=1.0"]
```

**Dockerfile system deps**:

```dockerfile
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libheif-dev \
    && rm -rf /var/lib/apt/lists/*
```

---

## 13. Docker Additions

```yaml
# docker-compose.yml additions
services:
  api:
    volumes:
      - ./data/media:/data/media
      - whisper-models:/root/.cache/huggingface
    deploy:
      resources:
        limits:
          memory: 4G

  celery-worker:
    volumes:
      - ./data/media:/data/media
      - whisper-models:/root/.cache/huggingface
    deploy:
      resources:
        limits:
          memory: 4G

volumes:
  whisper-models:
```

---

## 14. Environment Variables

```bash
# .env additions
WHISPER_MODEL_SIZE=medium            # small | medium | large-v3
WHISPER_DEVICE=auto                  # auto | cpu | cuda
WHISPER_CLOUD_FALLBACK=false
OPENAI_API_KEY=sk-...                # Only if cloud fallback enabled

MEDIA_MAX_PHOTO_MB=20
MEDIA_MAX_VIDEO_MB=500
MEDIA_MAX_AUDIO_MB=100
MEDIA_STORAGE_PATH=/data/media
VIDEO_MAX_KEYFRAMES=8
```

---

## 15. Implementation Phase

**Add to Phase 2** (after tag/reference):
- Media upload endpoint + local storage
- Photo: thumbnail generation, HEIC conversion
- Video: ffprobe metadata, thumbnail, mp4 transcode
- Audio: ffprobe metadata
- MediaEmbed components (photo/video/audio)
- Drag-and-drop upload in TipTap editor
- Embed syntax parsing in markdown renderer

**Add to Phase 3** (alongside agent):
- faster-whisper setup + audio transcription task
- Photo captioning task (Claude Vision)
- Video captioning task (keyframes + audio)
- Unified search across diary text + media_text
- Media text display in all embed components
- Agent media-awareness in context building

**Add to Phase 4** (iOS):
- Photo/video picker + upload
- Audio recorder (mic button in editor)
- Native audio player with transcript
- Native video player with caption overlay
- Push notification when captioning completes

---

## 16. Backup Strategy

```makefile
backup-full:
	tar -czf backup-full-$(shell date +%Y%m%d).tar.gz data/

backup-light:    # DB + markdown + text only (no media binaries)
	docker compose exec postgres pg_dump -U diary_user diary > backup-db.sql
	tar -czf backup-light-$(shell date +%Y%m%d).tar.gz data/diaries/ backup-db.sql
	rm backup-db.sql

backup-media:    # Rsync media to separate storage
	rsync -avz data/media/ backup-server:/backups/diary-media/
```
