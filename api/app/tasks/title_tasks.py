"""Auto-title generation via LLM."""
import httpx
from app.tasks import celery_app
from app.config import settings
from app.database import sync_session_factory
from app.models.diary import DiaryEntry


TITLE_PROMPT = """用一句话（15字以内中文或8个词以内英文）概括这篇日记的核心内容，作为标题用于引用和检索。不要加引号和标点。直接输出标题，不要任何其他内容。

日记内容：
{content}"""


@celery_app.task(bind=True, max_retries=2)
def generate_auto_title(self, entry_id: str):
    """Generate auto-title for a diary entry using LLM."""
    db = sync_session_factory()
    try:
        entry = db.query(DiaryEntry).filter(DiaryEntry.id == entry_id).first()
        if not entry or not entry.raw_text:
            return

        content = entry.raw_text[:2000]

        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "anthropic/claude-haiku-4-5-20251001",
                    "messages": [
                        {
                            "role": "user",
                            "content": TITLE_PROMPT.format(content=content),
                        }
                    ],
                    "max_tokens": 50,
                },
            )
            response.raise_for_status()
            result = response.json()

        title = result["choices"][0]["message"]["content"].strip()
        # Clean up: remove quotes and trailing punctuation
        title = title.strip('"\'""''').rstrip("。.!！?？")

        if len(title) > 100:
            title = title[:100]

        entry.auto_title = title
        db.commit()

    except Exception as e:
        db.rollback()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()
